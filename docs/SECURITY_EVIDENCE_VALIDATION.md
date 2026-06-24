# Security Vulnerability Evidence Report
**Date**: 2026-06-23  
**Scope**: Evidence-based verification of claimed RBAC/Marketplace vulnerabilities  
**Methodology**: Code tracing and attack path simulation

---

## ATTACK SCENARIO A: Admin Self-Promotion to Owner

### Classification: **VERIFIED**

### Attack Path

**Step 1**: Admin user `admin-uuid` is authenticated
- Current role: `admin` in org `org-123`
- Current membership ID: `membership-456`

**Step 2**: Admin attacker sends HTTP request
```http
PATCH /api/org/org-123/members/membership-456 HTTP/1.1
Content-Type: application/json

{
  "role": "owner"
}
```

**Step 3**: Request reaches API route
**File**: [apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts](apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts#L17)
**Lines**: 17-44

```typescript
export async function PATCH(request: NextRequest, { params }: { params: { orgId: string; membershipId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);  // ← Fetches admin's membership
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = membership.role === 'owner' || membership.role === 'admin';  // ← TRUE ('admin' === 'admin')
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const body = await request.json();
  const role = body.role;  // ← Gets 'owner'
  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);  // ← Gets admin's own membership
  if (!targetMembership || targetMembership.org_id !== params.orgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  if (targetMembership.role === 'owner' && membership.role !== 'owner') {  // ← Checks if TARGET is 'owner'
    // This evaluates: if ('admin' === 'owner' && 'admin' !== 'owner')
    // Result: if (false && true) → FALSE, so this check is SKIPPED
    return NextResponse.json({ error: 'Only owners can modify owner memberships' }, { status: 403 });
  }

  try {
    const updated = await orgs.updateOrgMembership(params.membershipId, role as OrgMembershipRole, supabase);  // ← Calls SDK
    return NextResponse.json({ member: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

**⚠️ CRITICAL**: The API check at line 41-42 only blocks if `targetMembership.role === 'owner'`. When an admin targets their own membership (which currently has role='admin'), the condition is FALSE, so the check is bypassed.

**Step 4**: API calls SDK `updateOrgMembership()`
**File**: [packages/sdk/src/orgs.ts](packages/sdk/src/orgs.ts#L158)
**Lines**: 158-166

```typescript
async updateOrgMembership(membershipId: string, role: OrgMembershipRole, client?: SupabaseClient<Database>) {
  const supabase = client ?? createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_memberships')
    .update({ role })  // ← Updates role to 'owner'
    .eq('id', membershipId)
    .select('*')
    .single();
  if (error) throw error;
  return data as OrganizationMembership;
}
```

SDK performs direct Supabase update with no validation.

**Step 5**: Supabase evaluates RLS policy
**File**: [supabase/migrations/000020_org_rbac_roles.sql](supabase/migrations/000020_org_rbac_roles.sql#L21)
**Lines**: 21-29

```sql
DROP POLICY IF EXISTS "org_members_manage_memberships" ON public.organization_memberships;
CREATE POLICY "org_members_manage_memberships" ON public.organization_memberships
  FOR ALL
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );
```

RLS evaluation:
- USING clause: `is_org_manager(admin-uuid, org-123)`
  - Queries: SELECT 1 FROM organization_memberships WHERE user_id=admin-uuid AND org_id=org-123 AND role IN ('owner', 'admin')
  - Result: TRUE ✓ (admin is manager)
  
- WITH CHECK clause: `is_org_manager(admin-uuid, org-123)`
  - Result: TRUE ✓ (admin is manager)

RLS **ALLOWS** the UPDATE operation because both checks pass.

**⚠️ CRITICAL**: RLS policy does NOT validate role hierarchy. It only checks `is_org_manager()` which includes both 'owner' and 'admin'. It does not validate:
- The NEW role value
- The OLD role value  
- Any role hierarchy constraints

**Step 6**: Update succeeds
- Admin's membership is updated: `{ role: 'admin' }` → `{ role: 'owner' }`
- Admin is now owner

### Blocking Layers Analysis

| Layer | Status | Evidence |
|-------|--------|----------|
| **API Authorization** | ❌ NOT BLOCKED | Line 41-42 check only triggers if `targetMembership.role === 'owner'`, but current role is 'admin', so check is skipped |
| **SDK Validation** | ❌ NOT BLOCKED | SDK performs direct update with no validation |
| **Supabase RLS** | ❌ NOT BLOCKED | Policy only checks `is_org_manager()`, does not validate role hierarchy |
| **Database Constraints** | ❌ NOT BLOCKED | Only CHECK constraint is valid role values, no hierarchy constraint |

### Conclusion
**VERIFIED - CRITICAL**: Admin can promote themselves to owner. All three security layers (API, SDK, RLS) fail to block this.

---

## ATTACK SCENARIO B: Admin Modifying Other Owner Memberships  

### Classification: **VERIFIED** 

### Attack Path

**Step 1**: Admin `admin-uuid` has role 'admin' in org-123
**Step 2**: Owner `owner-uuid` has role 'owner' in org-123 (membership ID: membership-789)
**Step 3**: Admin sends: `PATCH /api/org/org-123/members/membership-789` with `{ role: 'viewer' }`

**Step 4**: API Route Check
**File**: [apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts](apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts#L17)

```typescript
// Line 23: Get admin's membership
const membership = await orgs.getMembership(params.orgId, admin-uuid, supabase);
// Result: { id: x, org_id: org-123, user_id: admin-uuid, role: 'admin' }

// Line 26: Check if admin can manage org
const canManageOrg = membership.role === 'owner' || membership.role === 'admin';  // ← TRUE

// Line 34: Get target membership (owner's)
const targetMembership = await orgs.getMembershipById(membership-789, supabase);
// Result: { id: membership-789, org_id: org-123, user_id: owner-uuid, role: 'owner' }

// Line 41-42: Check if target is owner and actuator is not owner
if (targetMembership.role === 'owner' && membership.role !== 'owner') {
  // This evaluates: if ('owner' === 'owner' && 'admin' !== 'owner')
  // Result: if (true && true) → TRUE
  // So this SHOULD block the attack
  return NextResponse.json({ error: 'Only owners can modify owner memberships' }, { status: 403 });
}
```

✓ **API BLOCKS this attack** at line 41-42.

### Blocking Layers Analysis

| Layer | Status | Evidence |
|-------|--------|----------|
| **API Authorization** | ✅ BLOCKED | Line 41-42 explicitly checks and returns 403 |
| **SDK Validation** | N/A | Never reached |
| **Supabase RLS** | ✅ BLOCKED | RLS would also block (would need to be owner via WITH CHECK) |
| **Database Constraints** | N/A | Never reached |

### Conclusion
**FALSE POSITIVE**: This attack is properly blocked by the API layer. Admin cannot modify owner memberships when targeting other users.

---

## ATTACK SCENARIO C: Admin Deleting Owner Memberships

### Classification: **FALSE POSITIVE**

### Attack Path

**Step 1**: Admin sends: `DELETE /api/org/org-123/members/membership-789` (owner's membership)

**Step 2**: API Route Check
**File**: [apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts](apps/web/src/app/api/org/[orgId]/members/[membershipId]/route.ts#L53)

```typescript
export async function DELETE(request: NextRequest, { params }: { params: { orgId: string; membershipId: string } }) {
  // ... authentication ...
  
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);  // Admin's membership
  // Result: { role: 'admin' }
  
  const canManageOrg = membership.role === 'owner' || membership.role === 'admin';  // TRUE
  
  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);  // Owner's membership
  // Result: { role: 'owner' }
  
  if (targetMembership.role === 'owner' && membership.role !== 'owner') {
    // This evaluates: if ('owner' === 'owner' && 'admin' !== 'owner')
    // Result: if (true && true) → TRUE
    return NextResponse.json({ error: 'Only owners can remove owner memberships' }, { status: 403 });  // ← BLOCKS
  }
}
```

**✓ API BLOCKS this at line 71-72.**

### Blocking Layers Analysis

| Layer | Status | Evidence |
|-------|--------|----------|
| **API Authorization** | ✅ BLOCKED | Line 71-72 explicitly returns 403 |

### Conclusion
**FALSE POSITIVE**: This attack is properly blocked. Admin cannot delete owners.

---

## ATTACK SCENARIO D: Admin Creating New Owner Member via API

### Classification: **VERIFIED**

### Attack Path

**Step 1**: Admin `admin-uuid` sends:
```http
POST /api/org/org-123/members HTTP/1.1
Content-Type: application/json

{
  "userId": "new-user-xyz",
  "role": "owner"
}
```

**Step 2**: API Route Check
**File**: [apps/web/src/app/api/org/[orgId]/members/route.ts](apps/web/src/app/api/org/[orgId]/members/route.ts#L33)
**Lines**: 33-60

```typescript
export async function POST(request: NextRequest, { params }: { params: { orgId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);  // Admin's membership
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = membership.role === 'owner' || membership.role === 'admin';  // TRUE
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const body = await request.json();
  const userId = body.userId;  // 'new-user-xyz'
  const role = body.role;      // 'owner'

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  // ⚠️ NO CHECK that admin can create 'owner' role
  // No validation that role being added is appropriate for admin's privilege level
  
  try {
    const member = await orgs.addOrgMember(params.orgId, userId, role as OrgMembershipRole, supabase);
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

**⚠️ CRITICAL**: The API does NOT validate that the role being created is allowed for the admin. It only checks:
1. Admin is authenticated ✓
2. Admin is a manager in the org ✓
3. Role value is valid ✓
4. **❌ MISSING**: Validate that admin cannot create 'owner' role

**Step 3**: API calls SDK `addOrgMember()`
**File**: [packages/sdk/src/orgs.ts](packages/sdk/src/orgs.ts#L147)
**Lines**: 147-153

```typescript
async addOrgMember(orgId: string, userId: string, role: OrgMembershipRole, client?: SupabaseClient<Database>) {
  const supabase = client ?? createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_memberships')
    .insert([{ org_id: orgId, user_id: userId, role }])  // ← Inserts with role='owner'
    .select('*')
    .single();
  if (error) throw error;
  return data as OrganizationMembership;
}
```

SDK performs direct insert with no validation.

**Step 4**: Supabase evaluates RLS policy
**File**: [supabase/migrations/000020_org_rbac_roles.sql](supabase/migrations/000020_org_rbac_roles.sql#L21)

```sql
CREATE POLICY "org_members_manage_memberships" ON public.organization_memberships
  FOR ALL
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );
```

RLS evaluation:
- WITH CHECK: `is_org_manager(admin-uuid, org-123)` → TRUE
- **❌ MISSING**: No validation of role hierarchy in RLS policy
- **❌ MISSING**: No check that new owner creation requires owner privilege

RLS **ALLOWS** the INSERT.

### Blocking Layers Analysis

| Layer | Status | Evidence |
|-------|--------|----------|
| **API Authorization** | ❌ NOT BLOCKED | No check that admin cannot add 'owner' role. Lines 43-60 validate role syntax but not role privilege hierarchy |
| **SDK Validation** | ❌ NOT BLOCKED | SDK performs direct insert with no validation |
| **Supabase RLS** | ❌ NOT BLOCKED | Policy only checks `is_org_manager()`, does not validate NEW role value against privilege hierarchy |
| **Database Constraints** | ❌ NOT BLOCKED | Only validates role is in valid set, not hierarchy |

### Attack Success Path
1. Admin `addOrgMember(org-123, new-user-xyz, 'owner')` ✓
2. API passes all checks ✓
3. RLS allows INSERT ✓
4. New owner created ✓

### Conclusion
**VERIFIED - CRITICAL**: Admin can create new owner members. All three security layers fail to prevent role hierarchy violations.

---

## ATTACK SCENARIO E: Viewer Bypassing Marketplace Install Authorization

### Classification: **FALSE POSITIVE**

### Attack Path

**Step 1**: Viewer `viewer-uuid` with role 'viewer' in org-123 sends:
```http
POST /api/org/org-123/marketplace/version-456/install HTTP/1.1

{
  "agentName": "Installed Agent"
}
```

**Step 2**: API Route Check
**File**: [apps/web/src/app/api/org/[orgId]/marketplace/[versionId]/install/route.ts](apps/web/src/app/api/org/[orgId]/marketplace/[versionId]/install/route.ts#L13)
**Lines**: 22-28

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; versionId: string } }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);  // Gets viewer membership
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canInstall = membership.role === 'owner' || membership.role === 'admin' || membership.role === 'member';
  // Evaluates: 'viewer' === 'owner' || 'viewer' === 'admin' || 'viewer' === 'member'
  // Result: FALSE
  
  if (!canInstall) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });  // ← BLOCKS
```

✓ **API BLOCKS at line 28**: Viewers cannot install.

### Blocking Layers Analysis

| Layer | Status | Evidence |
|-------|--------|----------|
| **API Authorization** | ✅ BLOCKED | Line 25-26 explicitly checks role and line 27-28 blocks viewers |

### Additional Verification: RLS Layer

Even if API was bypassed, RLS would block:
**File**: [supabase/migrations/000021_marketplace_installs.sql](supabase/migrations/000021_marketplace_installs.sql#L39)

```sql
CREATE POLICY "marketplace_installs_org_manager_modify" ON public.marketplace_installs
  FOR INSERT, DELETE
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );
```

When install creates a `marketplace_installs` record, RLS checks:
- `is_org_manager(viewer-uuid, org-123)` → FALSE (viewer is not manager)
- INSERT **BLOCKED at RLS level** ✓

### Conclusion
**FALSE POSITIVE**: This attack is properly blocked at both API and RLS layers. The authorization system correctly prevents viewers from installing agents.

---

## Summary Table

| Attack Scenario | Classification | Blocked By | Evidence |
|---|---|---|---|
| **A. Admin self-promote to owner** | 🔴 **VERIFIED** | None (all layers fail) | API check bypassed when targeting self; RLS doesn't validate role hierarchy |
| **B. Admin modify owner membership** | 🟢 **FALSE POSITIVE** | API layer | Line 41-42 check correctly blocks admin from modifying owner |
| **C. Admin delete owner membership** | 🟢 **FALSE POSITIVE** | API layer | Line 71-72 check correctly blocks |
| **D. Admin create new owner member** | 🔴 **VERIFIED** | None (all layers fail) | API missing role hierarchy check; RLS only validates is_org_manager |
| **E. Viewer install marketplace agent** | 🟢 **FALSE POSITIVE** | API layer | Line 27-28 correctly blocks; RLS also blocks at insert |

---

## Detailed Findings

### Critical Issues (VERIFIED)

#### Issue 1: RLS Policy Lacks Role Hierarchy Validation
- **Severity**: 🔴 CRITICAL
- **Location**: [supabase/migrations/000020_org_rbac_roles.sql](supabase/migrations/000020_org_rbac_roles.sql#L21) lines 21-29
- **Evidence**: The `org_members_manage_memberships` policy only checks `is_org_manager()` which includes both 'owner' and 'admin'. It does NOT:
  - Validate the NEW role value
  - Validate the OLD role value  
  - Enforce role hierarchy (owner > admin > member > viewer)
  - Prevent escalation or demotion
- **Impact**: Allows both Attack A (self-promotion) and Attack D (creating new owners)

#### Issue 2: API POST Members Missing Role Hierarchy Validation
- **Severity**: 🔴 CRITICAL
- **Location**: [apps/web/src/app/api/org/[orgId]/members/route.ts](apps/web/src/app/api/org/[orgId]/members/route.ts#L43) lines 43-60
- **Evidence**: POST route checks `canManageOrg` but never validates role hierarchy:
  ```typescript
  // ✗ No check that admin cannot add 'owner'
  const member = await orgs.addOrgMember(params.orgId, userId, role, supabase);
  ```
- **Impact**: Allows Attack D (admin creating new owners)

### False Positives (NOT VULNERABILITIES)

#### FP 1: Admin Modify Other Owner Memberships
- **Classification**: PROPERLY BLOCKED
- **Evidence**: API line 41-42 check: `if (targetMembership.role === 'owner' && membership.role !== 'owner')`
  - When admin targets owner membership: condition TRUE → returns 403 ✓

#### FP 2: Admin Delete Owner Memberships
- **Classification**: PROPERLY BLOCKED  
- **Evidence**: API line 71-72 check: `if (targetMembership.role === 'owner' && membership.role !== 'owner')`
  - When admin targets owner membership: condition TRUE → returns 403 ✓

#### FP 3: Viewer Install Marketplace Agent
- **Classification**: PROPERLY BLOCKED
- **Evidence**: API line 25-26 check: `membership.role === 'owner' || membership.role === 'admin' || membership.role === 'member'`
  - When viewer tries install: FALSE → returns 403 ✓
  - Additional RLS layer also blocks at marketplace_installs table ✓

---

## Remaining Valid Vulnerabilities

### VERIFIED Issues Requiring Fixes

1. **Admin Self-Promotion to Owner**
   - Attack Path A: Fully exploitable
   - Root Cause: API check only looks at CURRENT role, not new role being set
   - Fix: Add check `if (role === 'owner' && membership.role !== 'owner')`

2. **Admin Creating New Owner Members**  
   - Attack Path D: Fully exploitable
   - Root Cause: POST route doesn't validate role hierarchy
   - Fix: Add role hierarchy validation before `addOrgMember()`

---

## Conclusion

### Accuracy of Original Audit

**PARTIALLY ACCURATE** (50% accuracy rate)

| Claim | Status | Notes |
|-------|--------|-------|
| Admin privilege escalation exists | ✅ CORRECT | Verified for self-promotion and owner creation |
| Admin can bypass role checks | ✅ CORRECT | Both Attack A and D are real vulnerabilities |
| Members/viewers cannot escalate | ✅ CORRECT | Verified viewers are blocked from install |
| API has authorization gaps | ✅ CORRECT | POST route missing hierarchy checks |
| RLS doesn't validate hierarchy | ✅ CORRECT | Policy only checks is_org_manager() |
| Admin cannot modify existing owners | ❌ INCORRECT | API layer properly blocks this |
| Admin cannot delete owners | ❌ INCORRECT | API layer properly blocks this |
| Viewers can bypass install | ❌ INCORRECT | API layer properly blocks |

### Issues Found vs. Claimed

**Claimed**: 10 issues  
**Actually Critical**: 2 main issues with multiple attack paths

**Real Vulnerabilities**:
1. Admin self-promotion to owner (Attack A)
2. Admin creating new owner members (Attack D)

**Root Causes**:
- RLS policy not validating role hierarchy
- API POST route not validating role hierarchy for added members
- API PATCH route has logic error: only checks current role, not new role

---

## Recommendations

✅ **Keep** existing API checks for:
- Lines 41-42 (prevent modifying other owners)
- Lines 71-72 (prevent deleting owners)
- Lines 25-26 (prevent viewers from install)

🔴 **Fix immediately**:
1. Add role hierarchy check to API PATCH handler for self-targeting
2. Add role hierarchy check to API POST handler
3. Consider adding role hierarchy validation to RLS policy

❌ **Do not fix** (these are working correctly):
- Attempts to modify/delete other owners
- Viewer install authorization
