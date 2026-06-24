import { createServerSupabaseClient } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentVersion, Database } from './types';

export type MarketplaceInstallResult = {
  agent: any;
  install: any;
};

export type MarketplaceForkResult = {
  agent: any;
  version: any;
  install: any;
};

function normalizeAgentVersionRow(row: any): AgentVersion {
  return {
    id: row.id,
    agent_id: row.agent_id,
    version: row.version,
    version_number: row.version_number,
    description: row.description,
    system_prompt: row.system_prompt,
    model: row.model ?? 'gpt-4o-mini',
    workflow: row.workflow ?? [],
    tools: row.tools ?? [],
    metadata: row.metadata ?? {},
    created_by: row.created_by,
    created_at: row.created_at
  };
}

async function getSourceVersionAndAgent(supabase: SupabaseClient<Database>, sourceVersionId: string) {
  const { data: sourceVersion, error: versionError } = await supabase
    .from('agent_versions')
    .select('*')
    .eq('id', sourceVersionId)
    .single();
  if (versionError || !sourceVersion) throw versionError ?? new Error('Source version not found');

  const { data: sourceAgent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', sourceVersion.agent_id)
    .single();
  if (agentError || !sourceAgent) throw agentError ?? new Error('Source agent not found');

  return { sourceVersion, sourceAgent };
}

async function getTargetMembership(
  supabase: SupabaseClient<Database>,
  orgId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('*')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export type MarketplaceAgentVersion = AgentVersion & {
  agents: {
    id: string;
    org_id: string;
    name: string;
    slug: string;
    description: string | null;
    visibility: 'public' | 'private';
    latest_version_id: string | null;
  } | null;
};

export const marketplace = {
  async listPublicAgentVersions(limit = 50, _client?: SupabaseClient<Database>) {
    const supabase = _client ?? createServerSupabaseClient();
    const { data: marketplaceAgents, error: marketplaceError } = await supabase
      .from('marketplace_agents')
      .select('*')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (marketplaceError) throw marketplaceError;
    if (!marketplaceAgents || marketplaceAgents.length === 0) return [];

    const versionIds = marketplaceAgents
      .map((item) => item.latest_version_id)
      .filter((id): id is string => id !== null);
    if (versionIds.length === 0) return [];

    const { data: versions, error: versionError } = await supabase
      .from('agent_versions')
      .select('*')
      .in('id', versionIds)
      .order('created_at', { ascending: false });
    if (versionError) throw versionError;

    const agentMap = new Map<string, any>();
    for (const item of marketplaceAgents) {
      if (item.id) agentMap.set(item.id, item);
    }

    return (versions ?? []).map((version: any) => ({
      ...version,
      agents: agentMap.get(version.agent_id) ?? null
    }));
  },

  async getAgentVersion(versionId: string, _client?: SupabaseClient<Database>) {
    const supabase = _client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('id', versionId)
      .single();
    if (error || !data) throw error ?? new Error('Agent version not found');
    return normalizeAgentVersionRow(data);
  },

  async getMarketplaceAgentVersion(versionId: string, _client?: SupabaseClient<Database>) {
    const supabase = _client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('id', versionId)
      .single();
    if (error || !data) throw error ?? new Error('Agent version not found');

    const normalizedVersion = normalizeAgentVersionRow(data);

    const { data: marketplaceAgent, error: marketplaceAgentError } = await supabase
      .from('marketplace_agents')
      .select('*')
      .eq('id', normalizedVersion.agent_id)
      .maybeSingle();
    if (marketplaceAgentError) throw marketplaceAgentError;

    return {
      ...normalizedVersion,
      agents: marketplaceAgent ?? null
    };
  },

  async getAgentVisibility(agentId: string, orgId: string, _client?: SupabaseClient<Database>): Promise<'public' | 'private'> {
    const supabase = _client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('marketplace_agents')
      .select('visibility')
      .eq('id', agentId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) throw error;
    return data?.visibility ?? 'private';
  },

  async installAgent(
    versionId: string,
    orgId: string,
    userId: string,
    agentName: string,
    agentDescription?: string,
    _client?: SupabaseClient<Database>
  ): Promise<MarketplaceInstallResult> {
    // Use service role client for marketplace lookups and install creation; use authenticated client for permission checks
    const serviceClient = createServerSupabaseClient();
    const authenticatedClient = _client ?? serviceClient;

    const membership = await getTargetMembership(authenticatedClient, orgId, userId);
    if (!membership) throw new Error('User is not a member of target organization');
    if (membership.role === 'viewer') throw new Error('Viewer cannot install agents');

    const { sourceVersion, sourceAgent } = await getSourceVersionAndAgent(serviceClient, versionId);

    const { data: marketplaceAgent, error: marketplaceError } = await serviceClient
      .from('marketplace_agents')
      .select('*')
      .eq('id', sourceAgent.id)
      .single();
    if (marketplaceError || !marketplaceAgent) throw marketplaceError ?? new Error('Marketplace agent not published');
    if (marketplaceAgent.visibility !== 'public') throw new Error('Marketplace agent is not public');

    const { data: agent, error: agentError } = await authenticatedClient
      .from('agents')
      .insert([
        {
          user_id: userId,
          organization_id: orgId,
          name: agentName,
          description: agentDescription ?? null,
          system_prompt: sourceVersion.system_prompt,
          model: sourceVersion.model
        }
      ])
      .select('*')
      .single();
    if (agentError || !agent) throw agentError ?? new Error('Failed to create installed agent');

    // Use service client for marketplace_installs insert - needs bypass RLS to insert for different users
    const { data: install, error: installError } = await serviceClient
      .from('marketplace_installs')
      .insert([
        {
          org_id: orgId,
          source_version_id: versionId,
          installed_agent_id: agent.id
        }
      ])
      .select('*')
      .single();
    if (installError || !install) throw installError ?? new Error('Failed to create marketplace install');

    return { agent, install };
  },

  async forkMarketplaceAgent(
    versionId: string,
    orgId: string,
    userId: string,
    agentName: string,
    agentDescription?: string,
    customPrompt?: string,
    customModel?: string,
    _client?: SupabaseClient<Database>
  ): Promise<MarketplaceForkResult> {
    // Use service role client for marketplace lookups; use authenticated client for permission checks
    const serviceClient = createServerSupabaseClient();
    const authenticatedClient = _client ?? serviceClient;

    const membership = await getTargetMembership(authenticatedClient, orgId, userId);
    if (!membership) throw new Error('User is not a member of target organization');
    if (membership.role === 'viewer') throw new Error('Viewer cannot fork agents');

    const { sourceVersion, sourceAgent } = await getSourceVersionAndAgent(serviceClient, versionId);

    const { data: marketplaceAgent, error: marketplaceError } = await serviceClient
      .from('marketplace_agents')
      .select('*')
      .eq('id', sourceAgent.id)
      .single();
    if (marketplaceError || !marketplaceAgent) throw marketplaceError ?? new Error('Marketplace agent not published');
    if (marketplaceAgent.visibility !== 'public') throw new Error('Marketplace agent is not public');

    const forkSystemPrompt = customPrompt ?? sourceVersion.system_prompt;
    const forkModel = customModel ?? sourceVersion.model;
    const safeMetadata = typeof sourceVersion.metadata === 'object' && sourceVersion.metadata ? sourceVersion.metadata : {};

    const { data: agent, error: agentError } = await authenticatedClient
      .from('agents')
      .insert([
        {
          user_id: userId,
          organization_id: orgId,
          name: agentName,
          description: agentDescription ?? null,
          system_prompt: forkSystemPrompt,
          model: forkModel
        }
      ])
      .select('*')
      .single();
    if (agentError || !agent) throw agentError ?? new Error('Failed to create forked agent');

    const { data: version, error: versionError } = await authenticatedClient
      .from('agent_versions')
      .insert([
        {
          agent_id: agent.id,
          version: 'v1',
          version_number: 1,
          description: sourceVersion.description ?? null,
          system_prompt: forkSystemPrompt,
          workflow: sourceVersion.workflow ?? [],
          tools: sourceVersion.tools ?? [],
          metadata: { ...safeMetadata, forked_from_version_id: versionId },
          created_by: userId,
          model: forkModel
        }
      ])
      .select('*')
      .single();
    if (versionError || !version) throw versionError ?? new Error('Failed to create forked version');

    // Use service client for marketplace_installs insert - needs bypass RLS to insert for different users
    const { data: install, error: installError } = await serviceClient
      .from('marketplace_installs')
      .insert([
        {
          org_id: orgId,
          source_version_id: versionId,
          installed_agent_id: agent.id
        }
      ])
      .select('*')
      .single();
    if (installError || !install) throw installError ?? new Error('Failed to create marketplace install');

    return { agent, version, install };
  },

  async listOrgInstalledAgents(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('marketplace_installs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }
};

export default marketplace;
