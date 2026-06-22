import { NextResponse } from 'next/server';
import { createServerSupabaseClient, agents } from '@agent-workbench/sdk';

function sanitizeSlug(value: string) {
  const baseSlug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${baseSlug || 'agent'}-${value.slice(0, 8)}`;
}

export async function PATCH(req: Request, { params }: { params: { orgId: string; agentId: string } }) {
  const supabase = createServerSupabaseClient();
  const payload = await req.json();
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
