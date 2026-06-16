import { createServerSupabaseClient } from './supabaseClient';
import type { Agent } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const agents = {
  async create(
    userId: string,
    payload: { name: string; description?: string; system_prompt: string; model?: string },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .insert([
        {
          user_id: userId,
          name: payload.name,
          description: payload.description ?? null,
          system_prompt: payload.system_prompt,
          model: payload.model ?? 'gpt-4o-mini'
        }
      ])
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
    updates: { name?: string; description?: string | null; system_prompt?: string; model?: string },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('agents')
      .update(updates)
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
  }
};
