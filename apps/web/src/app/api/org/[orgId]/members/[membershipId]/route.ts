import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, orgs, canAssignRole } from '@agent-workbench/sdk';

const validRoles = ['owner', 'admin', 'member', 'viewer'] as const;
type OrgMembershipRole = (typeof validRoles)[number];

async function getAuthenticatedUser(request: NextRequest) {
  const authClient = createRouteHandlerSupabaseClient({ headers, cookies });
  const {
    data: { user }
  } = await authClient.auth.getUser();
  return user;
}

export async function PATCH(request: NextRequest, { params }: { params: { orgId: string; membershipId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = membership.role === 'owner' || membership.role === 'admin';
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const body = await request.json();
  const role = body.role;
  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);
  if (!targetMembership || targetMembership.org_id !== params.orgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  if (!canAssignRole(membership.role, role as OrgMembershipRole)) {
    return NextResponse.json({ error: 'Insufficient permissions to assign that role' }, { status: 403 });
  }

  if (targetMembership.role === 'owner' && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can modify owner memberships' }, { status: 403 });
  }

  try {
    const updated = await orgs.updateOrgMembership(params.membershipId, role as OrgMembershipRole, supabase);
    return NextResponse.json({ member: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { orgId: string; membershipId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = membership.role === 'owner' || membership.role === 'admin';
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const targetMembership = await orgs.getMembershipById(params.membershipId, supabase);
  if (!targetMembership || targetMembership.org_id !== params.orgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  if (targetMembership.role === 'owner' && membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can remove owner memberships' }, { status: 403 });
  }

  try {
    await orgs.removeOrgMembership(params.membershipId, supabase);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
