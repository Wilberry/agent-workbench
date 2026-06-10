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
      .from<Agent>('agents')
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
      .from<Agent>('agents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async get(agentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from<Agent>('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (error) throw error;
    return data;
  }
};
