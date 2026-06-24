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

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; versionId: string } }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  
  // Check membership and manager role
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canInstall = membership.role === 'owner' || membership.role === 'admin' || membership.role === 'member';
  if (!canInstall) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  try {
    const { agentName, agentDescription } = await request.json();

    if (!agentName) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
    }

    // Install the marketplace agent
    const result = await marketplace.installAgent(
      params.versionId,
      params.orgId,
      user.id,
      agentName,
      agentDescription ?? undefined,
      supabase
    );

    return NextResponse.json({ success: true, agent: result.agent, install: result.install });
  } catch (err) {
    console.error('Install error:', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to install agent' },
      { status: 500 }
    );
  }
}
