import { createServerSupabaseClient } from './supabaseClient';
import type { Conversation, Message } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const conversations = {
  async create(agentId: string, userId: string, title?: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ agent_id: agentId, user_id: userId, title: title ?? null }])
      .single();

    if (error) throw error;
    return data;
  },

  async list(agentId: string, userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async listByUser(userId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async get(conversationId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getOrCreate(agentId: string, userId: string, title?: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('conversations')
      .select('*')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing;

    const { data, error } = await supabase
      .from('conversations')
      .insert([{ agent_id: agentId, user_id: userId, title: title ?? null }])
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async listMessages(conversationId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async sendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .insert([{ conversation_id: conversationId, role, content }])
      .single();

    if (error) throw error;
    return data;
  }
};
