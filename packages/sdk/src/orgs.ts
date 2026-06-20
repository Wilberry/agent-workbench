import { createServerSupabaseClient } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, MarketplaceAgent, Organization, OrgBilling } from './types';

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

  async recordRunUsage(orgId: string, options: { tokensUsed?: number; runsUsed?: number } = {}, client?: SupabaseClient<Database>) {
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
  }
};
