import { createServerSupabaseClient } from './supabaseClient';
import { agents } from './agents';
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

  async assertAccess(userId: string, runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: run, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle();

    if (error) throw error;
    if (!run) throw new Error('Agent run not found');
    if (run.user_id === userId) return run;

    if (run.organization_id) {
      const { data: membership, error: membershipError } = await supabase
        .from('organization_memberships')
        .select('id')
        .eq('org_id', run.organization_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (membership) return run;
    }

    throw new Error('Not authorized to access this agent run');
  },

  async cancelRun(
    userId: string,
    runId: string,
    reason?: string | null,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const run = await this.assertAccess(userId, runId, supabase);
    const status = String(run.status);
    if (status === 'cancelled') return run as AgentRun;
    if (status === 'completed' || status === 'failed') {
      throw new Error(`Agent run is already ${status}`);
    }

    // Cancellation columns/status are introduced by the workflow-runtime migration.
    // Keep the SDK source-compatible with generated types until that migration is applied.
    const runtimeClient = supabase as any;
    const cancelledAt = new Date().toISOString();
    const cancellationReason = reason?.trim() || null;
    const { data: cancelledRun, error: cancelError } = await runtimeClient
      .from('agent_runs')
      .update({
        status: 'cancelled',
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        error_message: cancellationReason
      })
      .eq('id', runId)
      .in('status', ['pending', 'running'])
      .select('*')
      .maybeSingle();

    if (cancelError) throw cancelError;
    if (!cancelledRun) {
      const latest = await runtimeClient.from('agent_runs').select('*').eq('id', runId).single();
      if (latest.error) throw latest.error;
      if (String(latest.data?.status) === 'cancelled') return latest.data as AgentRun;
      throw new Error(`Agent run is already ${String(latest.data?.status ?? 'not executable')}`);
    }

    const { error: queueError } = await runtimeClient
      .from('agent_run_jobs')
      .update({
        status: 'cancelled',
        locked_at: null,
        cancelled_at: cancelledAt,
        error_message: cancellationReason ?? 'Cancelled by user',
        updated_at: cancelledAt
      })
      .eq('run_id', runId)
      .in('status', ['pending', 'running']);
    if (queueError) throw queueError;

    return cancelledRun as AgentRun;
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

  async orgTelemetry(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agent_runs')
      .select('estimated_cost, latency_ms, total_tokens')
      .eq('organization_id', orgId);
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      estimated_cost: number;
      latency_ms: number;
      total_tokens: number;
    }>;
    const total_runs = rows.length;
    const total_tokens = rows.reduce((sum, run) => sum + (run.total_tokens ?? 0), 0);
    const total_estimated_cost = rows.reduce((sum, run) => sum + (run.estimated_cost ?? 0), 0);
    const average_latency_ms = total_runs
      ? Math.round(rows.reduce((sum, run) => sum + (run.latency_ms ?? 0), 0) / total_runs)
      : 0;

    return { total_runs, total_tokens, total_estimated_cost, average_latency_ms };
  },

  async replayRun(
    originalRunId: string,
    options: {
      versionId?: string;
      reason?: string;
    } = {},
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: originalRun, error: fetchError } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', originalRunId)
      .single();

    if (fetchError || !originalRun) throw fetchError ?? new Error('Original run not found');

    let replayWorkflow = originalRun.workflow;
    if (options.versionId) {
      const versionToUse = await agents.getVersion(options.versionId, supabase);
      if (!versionToUse) throw new Error('Requested replay agent version not found');
      if (Array.isArray(versionToUse.workflow) && versionToUse.workflow.length > 0) {
        replayWorkflow = versionToUse.workflow;
      }
    }

    const { data: newRun, error: createError } = await supabase
      .from('agent_runs')
      .insert([
        {
          user_id: originalRun.user_id,
          conversation_id: originalRun.conversation_id,
          workflow: replayWorkflow,
          organization_id: originalRun.organization_id ?? null,
          agent_version_id: options.versionId ?? originalRun.agent_version_id ?? null,
          replay_of_run_id: originalRunId,
          replay_reason: options.reason ?? 'manual replay',
          is_replay: true,
          status: 'pending'
        }
      ])
      .select('*')
      .single();

    if (createError || !newRun) throw createError ?? new Error('Failed to create replay run');
    return newRun as AgentRun;
  },

  subscribeToRunEvents(runId: string, cb: (event: { event: string; payload: any }) => void) {
    return subscribeToRunEvents(runId, cb as any);
  }
};
