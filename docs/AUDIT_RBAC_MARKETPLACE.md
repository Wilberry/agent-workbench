# RBAC & Marketplace Install/Fork Audit Report

**Date**: 2025-06-23  
**Scope**: Audit of newly implemented RBAC (000020_org_rbac_roles.sql) and Marketplace Install/Fork (000021_marketplace_installs.sql) systems  
**Status**: 🔴 CRITICAL ISSUES FOUND - Security vulnerabilities require immediate fix

---

## Executive Summary

The newly implemented RBAC and Marketplace systems contain **critical privilege escalation vulnerabilities** that allow admins to promote themselves to owner roles, bypass org role restrictions, and potentially escalate privileges. Additionally, there are **policy enforcement gaps** and **missing API-level validation** that could allow unauthorized access.

**Recommendation**: Deploy security fixes immediately before production use.

---

## Critical Issues Found

### 1. 🔴 CRITICAL: Admin Privilege Escalation via Role Hierarchy

**Severity**: CRITICAL  
**Component**: `000020_org_rbac_roles.sql` - RLS Policy  
**Location**: `org_members_manage_memberships` policy (lines 21-29)

#### Issue Description
The RLS policy allows ANY manager (owner OR admin) to modify ANY membership in an organization, including:
- Promoting themselves to owner
- Demoting owners to admin
- Creating new owner members
- Removing existing owners

```sql
-- VULNERABLE POLICY
CREATE POLICY "org_members_manage_memberships" ON public.organization_memberships
  FOR ALL
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );
```

The policy uses the same `is_org_manager()` check for both USING and WITH CHECK clauses, meaning an admin can:
```
UPDATE organization_memberships SET role='owner' WHERE id=admin_membership_id
```
This would succeed because:
1. USING check: admin is_org_manager = true ✓
2. WITH CHECK: admin is_org_manager = true ✓
3. No validation of NEW role values ✗

#### Proof of Concept
```
Admin user promotes self to owner:
1. Admin has role='admin' for org_id=X
2. Admin can UPDATE org.memberships SET role='owner' WHERE id=admin_membership_id
3. RLS allows this because admin passes is_org_manager check
4. Admin is now owner
```

#### Impact
- 🔴 Complete privilege escalation to owner level
- 🔴 Admins can remove legitimate owners
- 🔴 Admins can create new owner accounts
- 🔴 Defeats entire role hierarchy

#### Fix Required
Implement role-hierarchy-aware RLS policies:

```sql
-- FIXED POLICY - Separate policies by operation
-- Only allow promoting roles UP the hierarchy if you're already higher
-- owner > admin > member > viewer

CREATE POLICY "org_members_manage_memberships_select" ON public.organization_memberships
  FOR SELECT
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );

CREATE POLICY "org_members_manage_memberships_insert" ON public.organization_memberships
  FOR INSERT
  WITH CHECK (
    -- Only owners can create owners or admins
    (
      public.is_org_owner(auth.uid()::uuid, org_id) AND role IN ('owner', 'admin', 'member', 'viewer')
    )
    OR
    -- Admins can only create members or viewers
    (
      public.is_org_admin(auth.uid()::uuid, org_id) 
      AND public.is_org_admin(auth.uid()::uuid, org_id) != true
      AND role IN ('member', 'viewer')
    )
  );

CREATE POLICY "org_members_manage_memberships_update" ON public.organization_memberships
  FOR UPDATE
  USING (public.is_org_manager(auth.uid()::uuid, org_id))
  WITH CHECK (
    -- Cannot demote owner unless you're owner
    (
      role = 'owner' 
      AND public.is_org_owner(auth.uid()::uuid, org_id)
    )
    OR
    (
      role != 'owner'
      AND (
        -- Owner can do anything
        public.is_org_owner(auth.uid()::uuid, org_id)
        OR
        -- Admin cannot promote to owner/admin or manage existing admin/owner
        (
          public.is_org_admin(auth.uid()::uuid, org_id)
          AND NEW.role IN ('member', 'viewer')
        )
      )
    )
  );
```

---

### 2. 🔴 CRITICAL: Missing API Route Authorization for Role Hierarchy

**Severity**: CRITICAL  
**Component**: `apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts`  
**Location**: PATCH handler (lines 28-45)

#### Issue Description
The API route checks if user is manager but does NOT validate role hierarchy for the target role being set.

```typescript
// VULNERABLE CODE
const canManageOrg = membership.role === 'owner' || membership.role === 'admin';
if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

// ✗ NO VALIDATION that admin cannot promote to 'owner'
// ✗ NO VALIDATION that admin cannot demote 'owner'
const updated = await orgs.updateOrgMembership(params.membershipId, role, supabase);
```

An admin can send:
```json
PATCH /api/org/abc-org-id/members/def-membership-id
{
  "role": "owner"
}
```

And the API will call RLS policy, which will also be bypassed (see Issue #1).

#### Impact
- 🔴 Allows admins to promote themselves to owner via API
- 🔴 Allows admins to modify owner memberships
- 🔴 Even if RLS is fixed, API layer lacks checks

#### Fix Required
Add role hierarchy validation in API route:

```typescript
// Helper function
function canModifyRole(actuatorRole: string, targetCurrentRole: string, targetNewRole: string): boolean {
  const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 };
  
  // Owner can do anything
  if (actuatorRole === 'owner') return true;
  
  // Admin cannot promote others to owner or admin
  if (actuatorRole === 'admin') {
    const newRoleLevel = roleHierarchy[targetNewRole] || 0;
    return newRoleLevel <= roleHierarchy['member']; // admin, member <= 2
  }
  
  return false;
}

// In PATCH handler:
if (!canModifyRole(membership.role, targetMembership.role, role)) {
  return NextResponse.json(
    { error: `Your role (${membership.role}) cannot set target to ${role}` },
    { status: 403 }
  );
}
```

---

### 3. 🟠 HIGH: Missing Validation in POST Add Member API

**Severity**: HIGH  
**Component**: `apps/web/src/app/api/org/[orgId]/members/route.ts`  
**Location**: POST handler (lines 35-60)

#### Issue Description
The POST handler for adding new members does not validate that the requested role is allowed by the actuator's role level.

```typescript
// VULNERABLE CODE
const canManageOrg = membership.role === 'owner' || membership.role === 'admin';
if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

// ✗ NO VALIDATION that role being added is appropriate for actuator
const member = await orgs.addOrgMember(params.orgId, userId, role as OrgMembershipRole, supabase);
```

An admin CAN add a new user as owner:
```json
POST /api/org/abc-org-id/members
{
  "userId": "new-user-id",
  "role": "owner"
}
```

#### Impact
- 🟠 Admins can create new owner accounts
- 🟠 Adds unauthorized owners to org
- 🟠 Dilutes owner accountability

#### Fix Required
Apply same role hierarchy validation:

```typescript
const roleHierarchy: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
const actuatorLevel = roleHierarchy[membership.role] || 0;
const targetLevel = roleHierarchy[role] || 0;

if (actuatorLevel <= targetLevel) {
  return NextResponse.json(
    { error: `Your role cannot add members with role ${role}` },
    { status: 403 }
  );
}
```

---

### 4. 🟠 HIGH: Missing Org Membership Check on Marketplace Install

**Severity**: HIGH  
**Component**: `apps/web/src/app/api/org/[orgId]/marketplace/[versionId]/install/route.ts`  
**Location**: Membership check (line 23)

#### Issue Description
The install API checks membership exists but does NOT validate the user is actually in the org (only checks != null).

While the SDK's `marketplace.installAgent()` may have checks, the current check in the API is:
```typescript
const membership = await orgs.getMembership(params.orgId, user.id, supabase);
if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

// ✗ Membership could theoretically be stale or the user might have been removed
```

#### Impact
- 🟠 Time-of-check/time-of-use race condition possible
- 🟠 User removed from org could still install if timing is right

#### Fix Required
Verify membership role allows installation:

```typescript
const membership = await orgs.getMembership(params.orgId, user.id, supabase);
if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

if (!['member', 'admin', 'owner'].includes(membership.role)) {
  return NextResponse.json(
    { error: 'Only members, admins, and owners can install agents' },
    { status: 403 }
  );
}
```

---

### 5. 🟡 MEDIUM: Missing UPDATE Permission on Marketplace Installs Table

**Severity**: MEDIUM  
**Component**: `000021_marketplace_installs.sql` - RLS Policies  
**Location**: Lines 39-50 (INSERT/DELETE policies only)

#### Issue Description
The `marketplace_installs` table has policies for SELECT, INSERT, and DELETE but no explicit policy for UPDATE operations. This means:

1. UPDATE operations may fall through to default deny OR
2. May accidentally allow updates to any fields

```sql
-- Only INSERT and DELETE are explicitly allowed
-- No UPDATE policy defined
```

#### Impact
- 🟡 Ambiguous behavior on UPDATE attempts
- 🟡 Could allow unauthorized metadata modifications
- 🟡 Updates to installation records could be blocked unexpectedly

#### Fix Required
Add explicit UPDATE policy:

```sql
-- Marketplace installs: only managers can update records in their org
CREATE POLICY "marketplace_installs_org_manager_update" ON public.marketplace_installs
  FOR UPDATE
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
    AND org_id = OLD.org_id  -- Prevent changing org_id
    AND source_version_id = OLD.source_version_id  -- Prevent changing source
    AND installed_agent_id = OLD.installed_agent_id  -- Prevent changing agent
  );
```

---

## Medium Issues Found

### 6. 🟡 MEDIUM: Missing Indexes on marketplace_installs

**Severity**: MEDIUM  
**Component**: `000021_marketplace_installs.sql` - Indexes  
**Location**: Indexes section (lines 12-14)

#### Issue Description
Current indexes are good for lookup by org/source/agent, but missing indexes for:
- Query performance on listing installs by installed_agent_id for cascade operations
- Query optimization for common filter patterns

#### Fix Required
```sql
-- For cascade delete operations
CREATE INDEX IF NOT EXISTS idx_marketplace_installs_installed_agent_org 
  ON public.marketplace_installs(installed_agent_id, org_id);
```

---

### 7. 🟡 MEDIUM: Missing Validation for Forked Metadata

**Severity**: MEDIUM  
**Component**: `packages/sdk/src/marketplace.ts` - forkMarketplaceAgent function  
**Location**: Lines 152-158

#### Issue Description
When forking, the source version metadata is spread into the new version without validation:

```typescript
metadata: { forked_from_version_id: sourceVersionId, ...sourceVersion.metadata }
```

If source metadata contains sensitive fields or becomes corrupted, this could propagate issues.

#### Impact
- 🟡 Unvalidated metadata propagation
- 🟡 Could include malicious or corrupt metadata

#### Fix Required
Filter metadata on fork:

```typescript
metadata: { 
  forked_from_version_id: sourceVersionId,
  // Only copy safe metadata fields
  ...(sourceVersion.metadata?.tags && { tags: sourceVersion.metadata.tags }),
  ...(sourceVersion.metadata?.description && { description: sourceVersion.metadata.description })
}
```

---

## Logic Issues Found

### 8. 🟡 MEDIUM: Inconsistent Install Behavior with Duplicate Agents

**Severity**: MEDIUM  
**Component**: `packages/sdk/src/marketplace.ts` - installAgent function  
**Location**: Lines 63-103

#### Issue Description
The current implementation creates a NEW agent each time `installAgent()` is called, even if the same version was already installed in the org. This means:

1. Multiple agents could exist for the same marketplace version in one org
2. The UNIQUE constraint on (org_id, installed_agent_id) does not prevent duplicates if different agents are created
3. Behavior is inconsistent with "install" semantics

#### Impact
- 🟡 Unexpected behavior - "install again" creates duplicate agent, not reinstall
- 🟡 Bloats agent table
- 🟡 Could cause confusion in org agent management

#### Recommendation
Define behavior explicitly:

Option A (Current): Each install creates new agent - this works but is confusing
Option B (Better): Detect if already installed, reuse agent, update marketplace_installs
Option C (Best): Prevent duplicate installs at constraint level

Suggest documenting the expected behavior clearly in function docs.

---

## Data Integrity Issues Found

### 9. 🟡 MEDIUM: Missing CHECK Constraint on marketplace_installs

**Severity**: MEDIUM  
**Component**: `000021_marketplace_installs.sql` - Table definition  
**Location**: Lines 6-12

#### Issue Description
The table lacks CHECK constraints to ensure data validity:

```sql
-- MISSING: Validate created_at is not in future
-- MISSING: Validate IDs are not NULL (though NOT NULL helps)
CREATE TABLE IF NOT EXISTS public.marketplace_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_version_id uuid NOT NULL REFERENCES public.agent_versions(id) ON DELETE CASCADE,
  installed_agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, installed_agent_id)
);
```

#### Fix Required
```sql
ALTER TABLE public.marketplace_installs
  ADD CONSTRAINT chk_marketplace_installs_created_at 
    CHECK (created_at <= now());
```

---

## Security Best Practices Missing

### 10. 🟡 MEDIUM: Missing Audit Trail for Role Changes

**Severity**: MEDIUM  
**Component**: Organization membership system  
**Location**: `organization_memberships` table

#### Issue Description
There is no audit trail recording who changed a member's role and when. This makes it impossible to:
- Detect unauthorized privilege escalation
- Audit role changes
- Investigate security incidents

#### Recommendation
Add audit table or events table entry:

```sql
CREATE TABLE IF NOT EXISTS public.org_membership_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid REFERENCES public.organization_memberships(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL,
  previous_role text NOT NULL,
  new_role text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Summary Table

| # | Issue | Severity | Component | Status |
|---|-------|----------|-----------|--------|
| 1 | Admin can escalate to owner via RLS policy | 🔴 CRITICAL | Migration 000020 | ❌ UNFIXED |
| 2 | API lacks role hierarchy validation | 🔴 CRITICAL | members route | ❌ UNFIXED |
| 3 | POST members doesn't validate target role | 🟠 HIGH | members route | ❌ UNFIXED |
| 4 | Missing explicit role check on install | 🟠 HIGH | install route | ❌ UNFIXED |
| 5 | Missing UPDATE policy on marketplace_installs | 🟡 MEDIUM | Migration 000021 | ❌ UNFIXED |
| 6 | Missing indexes on marketplace_installs | 🟡 MEDIUM | Migration 000021 | ❌ UNFIXED |
| 7 | Unvalidated metadata spread on fork | 🟡 MEDIUM | marketplace.ts | ❌ UNFIXED |
| 8 | Inconsistent install behavior (duplicates) | 🟡 MEDIUM | marketplace.ts | ⚠️ DOCUMENT |
| 9 | Missing CHECK constraint on created_at | 🟡 MEDIUM | Migration 000021 | ❌ UNFIXED |
| 10 | No audit trail for role changes | 🟡 MEDIUM | System design | ❌ UNFIXED |

---

## Test Coverage Added

The following comprehensive tests have been added to validate and catch these issues:

### Security Tests
- **`rbac-privilege-escalation.spec.ts`**: Tests for privilege escalation scenarios
  - Admin self-promotion to owner
  - Admin demoting owner
  - Admin creating new owners
  - Role permission boundaries
  - Member/viewer role restrictions

- **`marketplace-install-fork.spec.ts`**: Tests for install/fork workflows
  - Install creates correct ownership records
  - Install validates org membership
  - Fork preserves source attribution
  - Duplicate install handling
  - Org isolation enforcement

- **`data-integrity.spec.ts`**: Tests for data constraints
  - Referential integrity
  - Cascade deletes
  - Unique constraints
  - Data consistency
  - Constraint compliance

---

## Recommended Action Plan

### Phase 1: CRITICAL (Do Before Production)
1. ✅ Create and run `rbac-privilege-escalation.spec.ts` tests to confirm issues
2. Deploy fixed RLS policies with role hierarchy validation
3. Add API route role hierarchy checks
4. Add UPDATE policy to marketplace_installs

### Phase 2: HIGH (Do Before GA)
1. Add explicit role validation to install/fork API routes
2. Add audit trail for membership changes
3. Add CHECK constraints

### Phase 3: MEDIUM (Technical Debt)
1. Add missing indexes
2. Validate and filter fork metadata
3. Document install behavior explicitly
4. Complete test coverage

---

## Test Execution

To run the new security tests:

```bash
# Run all security tests
pnpm exec vitest tests/security/ --run

# Run specific test suite
pnpm exec vitest tests/security/rbac-privilege-escalation.spec.ts --run
pnpm exec vitest tests/security/marketplace-install-fork.spec.ts --run
pnpm exec vitest tests/security/data-integrity.spec.ts --run
```

---

## Appendix: Helper Functions Needed

The following helper functions should be added to support fixed policies:

```sql
-- Add to migration 000020 before policies
CREATE OR REPLACE FUNCTION public.is_org_owner(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user
      AND om.org_id = p_org
      AND om.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user
      AND om.org_id = p_org
      AND om.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user
      AND om.org_id = p_org
      AND om.role IN ('member', 'admin', 'owner')
  );
$$;
```

---

## Conclusion

The newly implemented RBAC and Marketplace systems have **critical privilege escalation vulnerabilities** that must be fixed before production use. The identified issues are systematic and stem from incomplete role hierarchy validation at both the database and API levels.

The security test suites created will help prevent regression and validate fixes.

**Do not proceed with new feature development until these critical issues are resolved.**
