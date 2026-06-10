import { createServerSupabaseClient } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const tools = {
  async list(orgId?: string, publicOnly = false, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    let query = supabase.from('tools').select('*').order('created_at', { ascending: false });
    if (orgId) query = query.eq('org_id', orgId);
    if (publicOnly) query = query.eq('public', true);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async get(id: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('tools').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async create(payload: any, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('tools').insert([payload]).select('*').single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: any, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('tools').update(updates).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  },

  async delete(id: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { error } = await supabase.from('tools').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};
