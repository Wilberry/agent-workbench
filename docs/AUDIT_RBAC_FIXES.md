# RBAC & Marketplace Audit - Quick Fix Reference

## DO NOT DEPLOY UNTIL FIXED ⛔

### Critical Fixes Required

#### 1. Add Role Hierarchy Helper Functions (Migration 000020)

```sql
-- Add these BEFORE the policies

CREATE OR REPLACE FUNCTION public.is_org_owner(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user AND om.org_id = p_org AND om.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_not_owner(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user AND om.org_id = p_org AND om.role = 'admin'
  );
$$;
```

#### 2. Fix org_members_manage_memberships Policy (Migration 000020)

Replace the current all-in-one policy with separate, role-aware policies:

```sql
-- SELECT policy - same for all
DROP POLICY IF EXISTS "org_members_manage_memberships" ON public.organization_memberships;

CREATE POLICY "org_members_manage_memberships_select" ON public.organization_memberships
  FOR SELECT
  USING (public.is_org_manager(auth.uid()::uuid, org_id));

-- INSERT policy - role hierarchy
CREATE POLICY "org_members_manage_memberships_insert" ON public.organization_memberships
  FOR INSERT
  WITH CHECK (
    (public.is_org_owner(auth.uid()::uuid, org_id))
    OR
    (public.is_org_admin_not_owner(auth.uid()::uuid, org_id) AND role IN ('member', 'viewer'))
  );

-- UPDATE policy - prevent escalation
CREATE POLICY "org_members_manage_memberships_update" ON public.organization_memberships
  FOR UPDATE
  USING (public.is_org_manager(auth.uid()::uuid, org_id))
  WITH CHECK (
    (public.is_org_owner(auth.uid()::uuid, org_id))
    OR
    (public.is_org_admin_not_owner(auth.uid()::uuid, org_id) 
     AND NEW.role IN ('member', 'viewer')
     AND OLD.role IN ('member', 'viewer'))
  );

-- DELETE policy
CREATE POLICY "org_members_manage_memberships_delete" ON public.organization_memberships
  FOR DELETE
  USING (public.is_org_manager(auth.uid()::uuid, org_id))
  WITH CHECK (
    (public.is_org_owner(auth.uid()::uuid, org_id))
    OR
    (public.is_org_admin_not_owner(auth.uid()::uuid, org_id) AND role != 'owner')
  );
```

#### 3. Add UPDATE Policy to marketplace_installs (Migration 000021)

```sql
-- Add after INSERT/DELETE policies

CREATE POLICY "marketplace_installs_org_manager_update" ON public.marketplace_installs
  FOR UPDATE
  USING (public.is_org_manager(auth.uid()::uuid, org_id))
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
    AND org_id = OLD.org_id
    AND source_version_id = OLD.source_version_id
    AND installed_agent_id = OLD.installed_agent_id
  );
```

#### 4. Fix API Route: PATCH members/[membershipId] (apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts)

Add this helper function near top of file:

```typescript
function validateRoleChange(
  actuatorRole: 'owner' | 'admin' | 'member' | 'viewer',
  targetCurrentRole: 'owner' | 'admin' | 'member' | 'viewer',
  targetNewRole: 'owner' | 'admin' | 'member' | 'viewer'
): boolean {
  // Owner can do anything
  if (actuatorRole === 'owner') return true;
  
  // Admin cannot promote to owner/admin or change any owner/admin
  if (actuatorRole === 'admin') {
    if (targetCurrentRole === 'owner' || targetCurrentRole === 'admin') return false;
    if (targetNewRole === 'owner' || targetNewRole === 'admin') return false;
    return true;
  }
  
  return false;
}
```

Add to PATCH handler before `orgs.updateOrgMembership()`:

```typescript
if (!validateRoleChange(membership.role as any, targetMembership.role as any, role as any)) {
  return NextResponse.json(
    { error: `Role ${membership.role} cannot change ${targetMembership.role} to ${role}` },
    { status: 403 }
  );
}
```

#### 5. Fix API Route: POST members (apps/web/src/app/api/org/[orgId]/members/route.ts)

Add role validation before `orgs.addOrgMember()`:

```typescript
// Check if actuator can add this role
if (membership.role === 'admin' && (role === 'owner' || role === 'admin')) {
  return NextResponse.json(
    { error: `Role admin cannot add members with role ${role}` },
    { status: 403 }
  );
}

if (membership.role !== 'owner' && membership.role !== 'admin') {
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
}
```

#### 6. Fix API Route: Install (apps/web/src/app/api/org/[orgId]/marketplace/[versionId]/install/route.ts)

Add explicit role check after membership check:

```typescript
if (!['member', 'admin', 'owner'].includes(membership.role)) {
  return NextResponse.json(
    { error: 'Only members, admins, and owners can install agents' },
    { status: 403 }
  );
}
```

#### 7. Fix API Route: Fork (apps/web/src/app/api/org/[orgId]/marketplace/[versionId]/fork/route.ts)

Add same explicit role check as install.

---

## Test Execution

After applying fixes, run tests:

```bash
# All security tests
pnpm exec vitest tests/security/rbac-privilege-escalation.spec.ts tests/security/marketplace-install-fork.spec.ts tests/security/data-integrity.spec.ts --run
```

Expected results:
- ✅ Admins cannot escalate to owner
- ✅ Admins cannot modify owner memberships  
- ✅ Members/viewers cannot manage memberships
- ✅ Install/fork correctly validates permissions
- ✅ Data integrity constraints enforced

---

## Order of Deployment

1. **First**: Deploy migration updates (000020 policies + 000021 UPDATE policy)
2. **Second**: Deploy API route fixes
3. **Third**: Run test suite to validate

This ensures database-level security is in place before API routes.

---

## Rollback Plan

If issues arise:
- `000020_org_rbac_roles.sql` has been additive - policies can be dropped cleanly
- `000021_marketplace_installs.sql` can be reverted - has no data dependencies
- API route fixes can be reverted individually

---

## Verification Checklist

- [ ] RLS policies can no longer be bypassed by admin escalation
- [ ] Test suite shows all privilege escalation tests passing
- [ ] Install/fork APIs properly validate user roles
- [ ] Data integrity tests validate constraints
- [ ] No audit trail of privilege escalation attempts in logs
- [ ] Cascade deletes work correctly
- [ ] Unique constraints prevent duplicate installs
