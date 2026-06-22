import { createServerSupabaseClient } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, MarketplaceAgent, Organization, OrgBilling } from './types';

export class QuotaExceededError extends Error {
  code = 'QUOTA_EXCEEDED';
  status = 403;
  constructor(message = 'quota_exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export const orgs = {
  async createOrg(
    userId: string,
    org: { name: string; slug: string; description?: string | null; metadata?: Record<string, unknown> },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const payload: Partial<Organization> & { owner_id: string } = {
      ...org,
      owner_id: userId
    };

    const insertOrg = async (insertPayload: Partial<Organization>) => {
      const { data, error } = await supabase
        .from('organizations')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) return { data: null as Organization | null, error };
      return { data: data as Organization, error: null };
    };

    const { data, error } = await insertOrg(payload);
    let createdOrg: Organization | null = data;
    let insertError: any = error;

    if (insertError) {
      const message = insertError.message ?? String(insertError);
      const fallbackFields = ['slug', 'description', 'metadata'] as const;
      const fallbackPayload: Partial<Organization> & { owner_id?: string } = { ...payload };
      let shouldRetry = false;

      for (const field of fallbackFields) {
        if (
          message.includes(`column organizations.${field} does not exist`) ||
          message.includes(`Could not find the '${field}' column`) ||
          message.includes(`unknown column`) ||
          message.includes(`invalid column`)
        ) {
          shouldRetry = true;
          // delete with a cast to avoid strict index signature complaints
          delete (fallbackPayload as any)[field];
        }
      }

      if (shouldRetry) {
        const retryResult = await insertOrg(fallbackPayload);
        createdOrg = retryResult.data;
        insertError = retryResult.error;
      }
    }

    if (insertError || !createdOrg) throw insertError ?? new Error('Failed to create organization');

    await supabase.from('organization_memberships').insert([{ org_id: createdOrg.id, user_id: userId, role: 'owner' }]);
    await supabase.from('org_billing').insert([{ org_id: createdOrg.id, plan: 'free', tokens_used: 0, runs_used: 0 }]);
    return createdOrg;
  },

  async listUserOrgs(userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('owner_id', userId);

    if (error) throw error;
    return data ?? [];
  },

  async getOrg(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).single();
    if (error) throw error;
    return data;
  },

  async getMembership(orgId: string, userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('organization_memberships')
      .select('*')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async listOrgAgents(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async listOrgMarketplaceAgents(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('marketplace_agents')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async publishMarketplaceAgent(agentId: string, visibility: 'public' | 'private', client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('marketplace_agents')
      .update({ visibility })
      .eq('id', agentId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async getBilling(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('org_billing').select('*').eq('org_id', orgId).single();
    if (error) throw error;
    return data;
  },

  /**
   * recordRunUsage - unified entrypoint for recording run usage.
   * Backwards compatible wrapper:
   * - New callsite: recordRunUsage(orgId, runId, { tokens, estimatedCost }, client?) -> records to ledger
   * - Legacy callsite: recordRunUsage(orgId, { tokensUsed, runsUsed }, client?) -> updates org_billing
   */
  async recordRunUsage(
    orgId: string,
    runIdOrOptions: string | { tokensUsed?: number; runsUsed?: number } = {},
    maybeOptions?: { tokens?: number; estimatedCost?: number } | SupabaseClient<Database>,
    maybeClient?: SupabaseClient<Database>
  ) {
    // New-style call: (orgId, runId, usage, client?)
    if (typeof runIdOrOptions === 'string') {
      const runId = runIdOrOptions;
      const usage = (maybeOptions as { tokens?: number; estimatedCost?: number }) ?? { tokens: 0, estimatedCost: 0 };
      const client = maybeClient as SupabaseClient<Database> | undefined;
      return await this.recordUsageOnCompletion(orgId, runId, { tokens: usage.tokens ?? 0, estimatedCost: usage.estimatedCost ?? 0 }, client);
    }

    // Legacy call: (orgId, { tokensUsed, runsUsed }, client?)
    const options = runIdOrOptions as { tokensUsed?: number; runsUsed?: number };
    const client = (maybeOptions as SupabaseClient<Database>) ?? maybeClient;
    const supabase = client ?? createServerSupabaseClient();
    const updates: { tokens_used?: number; runs_used?: number } = {};
    if ((options.tokensUsed ?? 0) > 0) updates.tokens_used = options.tokensUsed;
    if ((options.runsUsed ?? 0) > 0) updates.runs_used = options.runsUsed;

    if (Object.keys(updates).length === 0) {
      const { data, error } = await supabase.from('org_billing').select('*').eq('org_id', orgId).single();
      if (error) throw error;
      if (!data) throw new Error('Billing record not found');
      return data;
    }

    const { data, error } = await supabase
      .from('org_billing')
      .update(updates)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async checkQuota(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('org_billing').select('*').eq('org_id', orgId).single();
    if (error) throw error;
    if (!data) throw new Error('Billing record not found');
    if (data.plan === 'free' && data.runs_used >= 5) {
      throw new Error('Org billing quota exceeded for free plan');
    }
    return data;
  },

  /**
   * Validate organization quota before execution
   * Returns quota info or throws QuotaExceededError with structured response
   * Policy: Free plan = 5 runs/month, Pro = 1000, Enterprise = unlimited
   */
  async validateQuota(orgId: string | null, client?: SupabaseClient<Database>) {
    if (!orgId) {
      // Personal runs have no quota limits currently
      return null;
    }

    const supabase = client ?? createServerSupabaseClient();

    // Try to get quota usage from events ledger
    let quotaData: { total_reserved?: number; net_reserved?: number } | null = null;
    try {
      const { data, error } = await supabase.rpc('get_organization_quota_usage', {
        org_id: orgId,
        event_type_filter: 'quota_reserved'
      });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        quotaData = data[0] as any;
      }
    } catch (_err) {
      // RPC may not be available yet
    }

    if (!quotaData) {
      // Fallback to legacy org_billing table if events table is not yet available
      const { data: legacyBilling, error: legacyError } = await supabase
        .from('org_billing')
        .select('*')
        .eq('org_id', orgId)
        .single();

      if (legacyError || !legacyBilling) {
        throw new Error('Unable to determine organization quota');
      }

      const plan = legacyBilling.plan as string;
      const runsUsed = legacyBilling.runs_used as number;

      if (plan === 'free' && runsUsed >= 5) {
        throw new QuotaExceededError('quota_exceeded');
      }

      return { plan, runsUsed, quota: plan === 'free' ? 5 : plan === 'pro' ? 1000 : Infinity };
    }

    const plan = (await supabase.from('org_billing').select('plan').eq('org_id', orgId).single()).data?.plan ?? 'free';
    const reserved = quotaData.net_reserved ?? 0;

    // Define quota limits by plan
    const quotaLimits: Record<string, number> = {
      free: 5,
      pro: 1000,
      enterprise: Infinity
    };

    const limit = quotaLimits[plan] ?? 5;

    if (reserved >= limit) {
      throw new QuotaExceededError('quota_exceeded');
    }

    return { plan, reserved, quota: limit };
  },

  /**
   * Reserve quota for a run before enqueueing
   * Atomically records a quota_reserved event
   * Returns reservation ID for tracking
   */
  async reserveQuota(
    orgId: string | null,
    runId: string,
    options: { estimatedCost?: number } = {},
    client?: SupabaseClient<Database>
  ): Promise<string | null> {
    if (!orgId) {
      // Personal runs have no reservation needed
      return null;
    }

    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase.rpc('reserve_organization_quota', {
      organization_id: orgId,
      run_id: runId,
      estimated_cost: options.estimatedCost ?? 0
    });

    if (error) {
      const message = error.message ?? String(error);
      if (message.includes('quota_exceeded')) {
        throw new QuotaExceededError('quota_exceeded');
      }
      throw error;
    }

    const reservation = Array.isArray(data) ? data[0] : data;
    return reservation?.id ?? null;
  },

  /**
   * Record usage when run completes
   * Idempotent: multiple calls with same run_id are safe
   */
  async recordUsageOnCompletion(
    orgId: string | null,
    runId: string,
    usage: { tokens: number; estimatedCost: number },
    client?: SupabaseClient<Database>
  ): Promise<void> {
    if (!orgId) return;

    const supabase = client ?? createServerSupabaseClient();

    // Check if this run was already recorded
    const { data: existing } = await supabase
      .from('organization_usage_events')
      .select('id')
      .eq('organization_id', orgId)
      .eq('run_id', runId)
      .eq('event_type', 'run_completed')
      .maybeSingle();

    if (existing) {
      // Idempotent: already recorded
      return;
    }

    const { error } = await supabase.from('organization_usage_events').insert([
      {
        organization_id: orgId,
        run_id: runId,
        event_type: 'run_completed',
        tokens: usage.tokens,
        estimated_cost: usage.estimatedCost,
        metadata: { timestamp: new Date().toISOString() }
      }
    ]);

    if (error) throw error;
  },

  /**
   * Record failed run (optional refund based on policy)
   * Current policy: Failed runs consume the reservation (no refund)
   */
  async recordRunFailure(
    orgId: string | null,
    runId: string,
    options: { reason?: string } = {},
    client?: SupabaseClient<Database>
  ): Promise<void> {
    if (!orgId) return;

    const supabase = client ?? createServerSupabaseClient();

    // Check if already recorded
    const { data: existing } = await supabase
      .from('organization_usage_events')
      .select('id')
      .eq('organization_id', orgId)
      .eq('run_id', runId)
      .eq('event_type', 'run_failed')
      .maybeSingle();

    if (existing) {
      return;
    }

    const { error } = await supabase.from('organization_usage_events').insert([
      {
        organization_id: orgId,
        run_id: runId,
        event_type: 'run_failed',
        tokens: 0,
        estimated_cost: 0,
        metadata: { reason: options.reason ?? 'Unknown error', timestamp: new Date().toISOString() }
      }
    ]);

    if (error) throw error;
  },

  /**
   * Get organization billing metrics from usage events
   * Derives metrics from append-only ledger for accuracy
   */
  async getBillingMetrics(orgId: string | null, client?: SupabaseClient<Database>) {
    if (!orgId) {
      return null;
    }

    const supabase = client ?? createServerSupabaseClient();

    // Try to get metrics from RPC
    let metricsResult: any = null;
    try {
      const { data, error } = await supabase.rpc('get_organization_billing_metrics', {
        org_id: orgId
      });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        metricsResult = data[0];
      }
    } catch (_err) {
      // RPC may not be available yet
    }

    if (metricsResult) {
      return {
        totalRuns: metricsResult.total_runs,
        totalTokens: metricsResult.total_tokens,
        totalCost: metricsResult.total_cost,
        completedRuns: metricsResult.completed_runs,
        failedRuns: metricsResult.failed_runs
      };
    }

    // Fallback: compute from agent_runs table
    const { data: runs } = await supabase
      .from('agent_runs')
      .select('total_tokens, estimated_cost, status')
      .eq('organization_id', orgId);

    if (!runs) {
      return { totalRuns: 0, totalTokens: 0, totalCost: 0, completedRuns: 0, failedRuns: 0 };
    }

    const completedRuns = runs.filter((r: any) => r.status === 'completed').length;
    const failedRuns = runs.filter((r: any) => r.status === 'failed').length;
    const totalTokens = runs.reduce((sum: number, r: any) => sum + (r.total_tokens ?? 0), 0);
    const totalCost = runs.reduce((sum: number, r: any) => sum + (r.estimated_cost ?? 0), 0);

    return { totalRuns: completedRuns + failedRuns, totalTokens, totalCost, completedRuns, failedRuns };
  }
};
