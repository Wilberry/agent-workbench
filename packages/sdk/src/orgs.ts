import { createServerSupabaseClient } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, MarketplaceAgent, Organization, OrgBilling } from './types';

export const orgs = {
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
  }
};
