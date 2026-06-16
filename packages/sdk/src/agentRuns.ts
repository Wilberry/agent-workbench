import { createServerSupabaseClient } from './supabaseClient';
import type { AgentRun } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { subscribeToRunEvents } from './realtime';

export const agentRuns = {
  async enqueueRun(
    options: {
      userId: string;
      conversationId: string;
      workflow: string[];
      orgId?: string;
      modelOverride?: string;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_runs')
      .insert([
        {
          user_id: options.userId,
          conversation_id: options.conversationId,
          workflow: options.workflow,
          organization_id: options.orgId ?? null,
          status: 'pending'
        }
      ])
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async get(runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) throw error;
    return data;
  },

  async listByConversation(conversationId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async listByUser(userId: string, limit = 50, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  async listOrgRuns(orgId: string, limit = 50, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  async replay(runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_runs')
      .select('id, status, current_step, created_at, execution_trace')
      .eq('id', runId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  subscribeToRunEvents(runId: string, cb: (event: { event: string; payload: any }) => void) {
    return subscribeToRunEvents(runId, cb as any);
  }
};
