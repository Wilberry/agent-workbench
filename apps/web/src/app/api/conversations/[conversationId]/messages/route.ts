import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@agent-workbench/sdk/src/supabaseClient';

export async function GET(_request: NextRequest, { params }: { params: { conversationId: string } }) {
  const { conversationId } = params;
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ messages: data }));
}
