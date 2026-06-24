import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, agents, orgs } from '@agent-workbench/sdk';

function sanitizeSlug(value: string) {
  const baseSlug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${baseSlug || 'agent'}-${value.slice(0, 8)}`;
}

export async function PATCH(request: NextRequest, { params }: { params: { orgId: string; agentId: string } }) {
  const authClient = createRouteHandlerSupabaseClient({ headers, cookies });
  const {
    data: { user }
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createServerSupabaseClient();
  const membership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!membership) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const canManageOrg = await orgs.isOrgManager(params.orgId, user.id, supabase);
  if (!canManageOrg) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const payload = await request.json();
  const visibility = payload.visibility === 'public' ? 'public' : 'private';

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.agentId)
    .eq('organization_id', params.orgId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found for organization' }, { status: 404 });
  }

  const latestVersion = await agents.getLatestVersion(agent.id, supabase).catch(() => null);
  const latestVersionId = latestVersion?.id ?? null;

  const { data: marketplaceAgent } = await supabase
    .from('marketplace_agents')
    .select('*')
    .eq('id', params.agentId)
    .eq('org_id', params.orgId)
    .maybeSingle();

  if (marketplaceAgent) {
    const { data, error } = await supabase
      .from('marketplace_agents')
      .update({ visibility, latest_version_id: latestVersionId })
      .eq('id', params.agentId)
      .eq('org_id', params.orgId)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ agent: data });
  }

  const slug = sanitizeSlug(agent.name || params.agentId);
  const insertPayload = {
    id: params.agentId,
    org_id: params.orgId,
    name: agent.name,
    slug,
    description: agent.description ?? null,
    visibility,
    latest_version_id: latestVersionId
  };

  const { data, error } = await supabase
    .from('marketplace_agents')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}
