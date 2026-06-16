import { createServerSupabaseClient } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const marketplace = {
  async listPublicAgentVersions(limit = 50, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const { data, error } = await supabase
      .from('agent_versions')
      .select('*, agents(id, name, description)')
      .filter("metadata->>public", 'eq', 'true')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as any[];
  },

  async getAgentVersion(versionId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agent_versions')
      .select('*, agents(id, name, description)')
      .eq('id', versionId)
      .single();
    if (error) throw error;
    return data as any;
  }
};
