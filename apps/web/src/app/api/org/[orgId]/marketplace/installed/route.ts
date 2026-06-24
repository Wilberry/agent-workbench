import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, orgs, marketplace } from '@agent-workbench/sdk';

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
  
  // Check membership
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  try {
    const installs = await marketplace.listOrgInstalledAgents(params.orgId, supabase);
    return NextResponse.json({ installs });
  } catch (err) {
    console.error('List installs error:', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to list installed agents' },
      { status: 500 }
    );
  }
}
