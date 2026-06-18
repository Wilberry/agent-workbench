import { NextRequest } from 'next/server';
import { enqueueAgentRun, getRelevantMemories } from '@agent-workbench/agent-runtime';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

type RunAgentBody = {
  userId: string;
  agentId: string;
  conversationId: string;
  message: string;
  workflow?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunAgentBody;
    const { userId, agentId, conversationId, message, workflow } = body;

    if (!userId || !agentId || !conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'userId, agentId, conversationId, and message are required' }),
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('agent_id', agentId)
      .single();

    if (conversationError || !conversation) {
      console.error('Invalid conversation for agent', { conversationError, conversation });
      return new Response(JSON.stringify({ error: 'Conversation does not belong to the provided agent' }), { status: 400 });
    }

    const { data: userMessageRow, error: userMessageError } = await supabase
      .from('messages')
      .insert([{ conversation_id: conversationId, role: 'user', content: message }])
      .select('id')
      .single();

    if (userMessageError || !userMessageRow) {
      console.error('Failed to save user message', { userMessageError, userMessageRow });
      return new Response(JSON.stringify({ error: 'Failed to save user message' }), { status: 500 });
    }

    const memories = await getRelevantMemories({ conversationId, query: message });

    const runId = await enqueueAgentRun({
      runId: '',
      userId,
      conversationId,
      message,
      workflow: workflow ?? ['Planner', 'Executor', 'Reviewer'],
      memories
    });

    return new Response(
      JSON.stringify({
        runId,
        status: 'pending',
        message: 'Workflow enqueued for background execution'
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}
