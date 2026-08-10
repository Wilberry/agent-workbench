import { createServerSupabaseClient } from './supabaseClient';
import type { Agent, AgentVersion } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

function normalizeProviderName(provider?: string | null) {
  return provider?.trim().toLowerCase() || 'openai';
}

function resolveCreateModel(provider: string, model?: string) {
  const normalizedModel = model?.trim();
  if (normalizedModel) return normalizedModel;
  if (provider === 'openai') return 'gpt-4o-mini';
  throw new Error(`model is required when creating an agent with provider: ${provider}`);
}

function assertProviderUpdateIncludesModel(provider: string | undefined, model: string | undefined) {
  if (provider !== undefined && !model?.trim()) {
    throw new Error('model must be provided when provider is updated');
  }
}

function normalizeAgentVersionRow(row: any, fallbackModel = 'gpt-4o-mini', fallbackProvider = 'openai') {
  return {
    ...row,
    model: row?.model ?? fallbackModel,
    provider: normalizeProviderName(row?.provider ?? fallbackProvider)
  };
}

export const agents = {
  async create(
    userId: string,
    payload: { name: string; description?: string; system_prompt: string; model?: string; provider?: string },
    organizationId?: string | null,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const provider = normalizeProviderName(payload.provider);
    const model = resolveCreateModel(provider, payload.model);
    const insertPayload = [
      {
        user_id: userId,
        organization_id: organizationId ?? null,
        name: payload.name,
        description: payload.description ?? null,
        system_prompt: payload.system_prompt,
        model,
        provider
      }
    ];
    const { data, error } = await supabase
      .from('agents')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async list(userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async listAll(client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async get(agentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (error) throw error;
    return data;
  },

  async update(
    agentId: string,
    updates: { name?: string; description?: string | null; system_prompt?: string; model?: string; provider?: string },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    assertProviderUpdateIncludesModel(updates.provider, updates.model);
    const normalizedUpdates = {
      ...updates,
      ...(updates.model !== undefined ? { model: updates.model.trim() } : {}),
      ...(updates.provider !== undefined ? { provider: normalizeProviderName(updates.provider) } : {})
    };
    const { data, error } = await supabase
      .from('agents')
      .update(normalizedUpdates)
      .eq('id', agentId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async delete(agentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { error } = await supabase.from('agents').delete().eq('id', agentId);
    if (error) throw error;
    return true;
  },

  // Agent versioning support
  async createVersion(
    agentId: string,
    userId: string,
    payload: {
      version?: string;
      description?: string;
      system_prompt?: string;
      model?: string;
      provider?: string;
      tools?: Record<string, unknown>[];
      workflow?: string[];
      metadata?: Record<string, unknown>;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();

    // Get the agent to ensure it exists and user has access
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) throw agentError ?? new Error('Agent not found');

    // Get the next version number
    const { data: versions } = await supabase
      .from('agent_versions')
      .select('version_number')
      .eq('agent_id', agentId)
      .order('version_number', { ascending: false })
      .limit(1) as { data: Array<{ version_number: number }> | null };

    const nextVersionNumber = ((versions?.[0]?.version_number as number | undefined) ?? 0) + 1;
    const versionLabel = payload.version ?? `v${nextVersionNumber}`;
    const currentProvider = normalizeProviderName(agent.provider);
    const provider = normalizeProviderName(payload.provider ?? currentProvider);
    if (payload.provider !== undefined && provider !== currentProvider && !payload.model?.trim()) {
      throw new Error('model must be provided when changing an agent version provider');
    }
    const model = payload.model?.trim() || agent.model || 'gpt-4o-mini';

    const insertPayload: Database['public']['Tables']['agent_versions']['Insert'] = {
      agent_id: agentId,
      version: versionLabel,
      version_number: nextVersionNumber,
      description: payload.description ?? null,
      system_prompt: payload.system_prompt ?? agent.system_prompt,
      workflow: payload.workflow ?? [],
      tools: payload.tools ?? [],
      metadata: payload.metadata ?? {},
      created_by: userId,
      model,
      provider
    };

    const { data, error } = await supabase
      .from('agent_versions')
      .insert([insertPayload])
      .select('*')
      .single();

    if (error) throw error;
    return normalizeAgentVersionRow(data, model, provider);
  },

  async listVersions(agentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('version_number', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((version) => normalizeAgentVersionRow(version));
  },

  async listAllVersions(client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('agent_versions').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((version) => normalizeAgentVersionRow(version));
  },

  async getByOwner(agentId: string, userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  async updateByOwner(
    agentId: string,
    userId: string,
    updates: { name?: string; description?: string | null; system_prompt?: string; model?: string; provider?: string },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    assertProviderUpdateIncludesModel(updates.provider, updates.model);
    const normalizedUpdates = {
      ...updates,
      ...(updates.model !== undefined ? { model: updates.model.trim() } : {}),
      ...(updates.provider !== undefined ? { provider: normalizeProviderName(updates.provider) } : {})
    };
    const { data, error } = await supabase
      .from('agents')
      .update(normalizedUpdates)
      .eq('id', agentId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteByOwner(agentId: string, userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { error } = await supabase.from('agents').delete().eq('id', agentId).eq('user_id', userId);
    if (error) throw error;
    return true;
  },

  async getVersion(versionId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error) throw error;
    return normalizeAgentVersionRow(data);
  },

  async resolveAgentVersion(agentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('agent_latest_version')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (error) throw error;
    return normalizeAgentVersionRow(data) as Database['public']['Views']['agent_latest_versions']['Row'] | null;
  },

  async getLatestVersion(agentId: string, client?: SupabaseClient<Database>) {
    return this.resolveAgentVersion(agentId, client);
  },

  async getLatestVersions(agentIds?: string[], client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const query = (supabase as any).from('agent_latest_version').select('*');
    if (agentIds && agentIds.length > 0) {
      query.in('agent_id', agentIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: any) => normalizeAgentVersionRow(row)) as Database['public']['Views']['agent_latest_versions']['Row'][];
  },

  async getAgentForExecution(agentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, description, system_prompt, model, provider, organization_id')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) throw agentError ?? new Error('Agent not found');

    const latestVersion = await this.resolveAgentVersion(agentId, client);
    return {
      agent: { ...agent, provider: normalizeProviderName(agent.provider) },
      latestVersion
    };
  }
};
