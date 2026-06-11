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

    const { data, error } = await supabase
      .from<Organization>('organizations')
      .insert([{ ...org, owner_id: userId }])
      .select('*')
      .single();

    if (error) throw error;
    await supabase.from('organization_memberships').insert([{ org_id: data.id, user_id: userId, role: 'owner' }]);
    await supabase.from('org_billing').insert([{ org_id: data.id, plan: 'free', tokens_used: 0, runs_used: 0 }]);
    return data;
  },

  async listUserOrgs(userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from<Organization>('organizations')
      .select('*, organization_memberships(user_id, role)')
      .eq('organization_memberships.user_id', userId);

    if (error) throw error;
    return data ?? [];
  },

  async getOrg(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from<Organization>('organizations').select('*').eq('id', orgId).single();
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
      .from<MarketplaceAgent>('marketplace_agents')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async publishMarketplaceAgent(agentId: string, visibility: 'public' | 'private', client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from<MarketplaceAgent>('marketplace_agents')
      .update({ visibility })
      .eq('id', agentId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async getBilling(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from<OrgBilling>('org_billing').select('*').eq('org_id', orgId).single();
    if (error) throw error;
    return data;
  },

  async recordRunUsage(orgId: string, options: { tokensUsed?: number; runsUsed?: number } = {}, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const updates = {
      tokens_used: (options.tokensUsed ?? 0) > 0 ? supabase.raw('tokens_used + ?', options.tokensUsed) : undefined,
      runs_used: (options.runsUsed ?? 0) > 0 ? supabase.raw('runs_used + ?', options.runsUsed) : undefined
    } as any;

    const { data, error } = await supabase
      .from<OrgBilling>('org_billing')
      .update(updates)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async checkQuota(orgId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from<OrgBilling>('org_billing').select('*').eq('org_id', orgId).single();
    if (error) throw error;
    if (!data) throw new Error('Billing record not found');
    if (data.plan === 'free' && data.runs_used >= 5) {
      throw new Error('Org billing quota exceeded for free plan');
    }
    return data;
  }
};
