import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, orgs } from '@agent-workbench/sdk';

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
    .from('agents')
    .select('*')
    .eq('organization_id', params.orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

export async function POST(request: NextRequest, { params }: { params: { orgId: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = await orgs.isOrgManager(params.orgId, user.id, supabase);
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const payload = await request.json();

  const { data, error } = await supabase
    .from('agents')
    .insert([
      {
        user_id: user.id,
        organization_id: params.orgId,
        name: payload.name,
        description: payload.description,
        system_prompt: payload.system_prompt,
        model: payload.model ?? 'gpt-4o-mini'
      }
    ])
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}
