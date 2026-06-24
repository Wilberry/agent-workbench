# Minimal Security Fixes - Evidence-Based

**Scope**: Fixes for 2 verified critical vulnerabilities  
**Files to Modify**: 1 (API route)  
**Lines to Change**: 2 locations

---

## Vulnerability #1: Admin Self-Promotion to Owner

### Location
[apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts](apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts#L38) - PATCH handler

### Current Code (Lines 38-46)
```typescript
  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);
  if (!targetMembership || targetMembership.org_id !== params.orgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  if (targetMembership.role === 'owner' && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can modify owner memberships' }, { status: 403 });
  }
```

### Problem
The check only prevents modifying an EXISTING owner membership. It doesn't prevent setting a role TO 'owner'.

### Fix
```typescript
  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);
  if (!targetMembership || targetMembership.org_id !== params.orgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  // Prevent escalation: only owners can create/promote to admin/owner roles
  if ((role === 'owner' || role === 'admin') && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can set admin/owner roles' }, { status: 403 });
  }

  if (targetMembership.role === 'owner' && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can modify owner memberships' }, { status: 403 });
  }
```

### Testing
```
Before Fix:
- Admin calls: PATCH /org/123/members/admin-membership with { role: 'owner' }
- Result: ❌ Admin becomes owner

After Fix:
- Admin calls: PATCH /org/123/members/admin-membership with { role: 'owner' }
- Result: ✅ Returns 403 "Only owners can set admin/owner roles"
```

---

## Vulnerability #2: Admin Creating New Owner Members

### Location
[apps/web/src/app/api/org/[orgId]/members/route.ts](apps/web/src/app/api/org/[orgId]/members/route.ts#L43) - POST handler

### Current Code (Lines 43-56)
```typescript
  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  try {
    const member = await orgs.addOrgMember(params.orgId, userId, role as OrgMembershipRole, supabase);
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
```

### Problem
The route validates that the role is syntactically valid but doesn't check if the admin can assign that role.

### Fix
```typescript
  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  // Only owners can create admin or owner members
  if ((role === 'owner' || role === 'admin') && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can create admin/owner members' }, { status: 403 });
  }

  try {
    const member = await orgs.addOrgMember(params.orgId, userId, role as OrgMembershipRole, supabase);
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
```

### Testing
```
Before Fix:
- Admin calls: POST /org/123/members with { userId: 'new-user', role: 'owner' }
- Result: ❌ New owner created

After Fix:
- Admin calls: POST /org/123/members with { userId: 'new-user', role: 'owner' }
- Result: ✅ Returns 403 "Only owners can create admin/owner members"

- Admin calls: POST /org/123/members with { userId: 'new-user', role: 'member' }
- Result: ✅ Member created (admin CAN create members/viewers)
```

---

## Complete Fixed Code

### File: apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts

Change lines 38-46 to:
```typescript
  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);
  if (!targetMembership || targetMembership.org_id !== params.orgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  // Prevent role escalation: only owners can set admin/owner roles
  if ((role === 'owner' || role === 'admin') && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can set admin/owner roles' }, { status: 403 });
  }

  if (targetMembership.role === 'owner' && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can modify owner memberships' }, { status: 403 });
  }
```

### File: apps/web/src/app/api/org/[orgId]/members/route.ts

Insert after line 52 (after role validation):
```typescript
  // Only owners can create admin or owner members
  if ((role === 'owner' || role === 'admin') && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can create admin/owner members' }, { status: 403 });
  }
```

---

## Validation

### No Other Changes Needed ✓
- API install/fork routes are properly securing marketplace operations
- API DELETE owner check is correct and working
- RLS policies, while they could be more explicit, don't prevent these attacks at this layer
- Database constraints are adequate
- Delete/remove operations are properly guarded

### Attack Scenarios After Fix

| Attack | Result |
|--------|--------|
| Admin self-promote to owner | ✅ BLOCKED by new PATCH check |
| Admin create new owner member | ✅ BLOCKED by new POST check |
| Admin modify existing owner | ✅ Already blocked by existing check |
| Admin delete owner | ✅ Already blocked by existing check |
| Viewer install agent | ✅ Already blocked by existing check |

---

## Deployment

1. Apply fixes to both API routes
2. Deploy and test
3. No database migrations needed
4. No SDK changes needed
5. No RLS policy changes needed for these fixes

---

## Code Review Checklist

After applying fixes:
- [ ] Line 42-45 in PATCH handler validates new role
- [ ] Line 53-56 in POST handler validates new role  
- [ ] Both checks verify `membership.role !== 'owner'`
- [ ] Both checks include 'admin' in role list (owner and admin are protected roles)
- [ ] Tests pass for:
  - Admin cannot self-promote to owner
  - Admin cannot promote to admin
  - Admin CAN promote to member/viewer
  - Admin cannot create new owner member
  - Admin cannot create new admin member
  - Admin CAN create new member/viewer
  - Owner can do everything
