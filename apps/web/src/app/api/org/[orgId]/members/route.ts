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

export async function GET(request: NextRequest, { params }: { params: { orgId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { data, error } = await supabase
    .from('organization_memberships')
    .select('*')
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}

export async function POST(request: NextRequest, { params }: { params: { orgId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = membership.role === 'owner' || membership.role === 'admin';
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const body = await request.json();
  const userId = body.userId;
  const role = body.role;

  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  if (!canAssignRole(membership.role, role as OrgMembershipRole)) {
    return NextResponse.json({ error: 'Insufficient permissions to assign that role' }, { status: 403 });
  }

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (!role || typeof role !== 'string' || !validRoles.includes(role as OrgMembershipRole)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  try {
    const member = await orgs.addOrgMember(params.orgId, userId, role as OrgMembershipRole, supabase);
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
