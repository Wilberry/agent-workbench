import { NextRequest } from 'next/server';
import { enqueueAgentRun, getRelevantMemories } from '@agent-workbench/agent-runtime';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { db } from '@/lib/db';

type RunAgentBody = {
  userId: string;
  agentId: string;
  conversationId: string;
  message: string;
  workflow?: string[];
  agentVersionId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunAgentBody;
    const { userId, agentId, conversationId, message, workflow, agentVersionId } = body;

    if (!userId || !agentId || !conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'userId, agentId, conversationId, and message are required' }),
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, agent_id')
      .eq('id', conversationId)
      .eq('agent_id', agentId)
      .single();

    if (conversationError || !conversation) {
      // Conversation not matching the agent is a bad request
      return new Response(JSON.stringify({ error: 'Conversation does not belong to the provided agent' }), { status: 400 });
    }

    let executionAgent;
    try {
      executionAgent = await db.agents.getAgentForExecution(agentId);
      if (!executionAgent || !executionAgent.agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
      }
    } catch (err) {
      const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
      if (msg.includes('not found')) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
      }
      console.error('Error fetching agent for execution:', err);
      return new Response(JSON.stringify({ error: 'Failed to fetch agent' }), { status: 500 });
    }

    let versionId: string | undefined = agentVersionId ?? undefined;
    if (!versionId) {
      versionId = executionAgent.latestVersion?.id ?? undefined;
    }

    // If a versionId was provided, validate it exists
    if (versionId) {
      try {
        const { id: _ } = await (await import('@agent-workbench/sdk')).agents.getVersion(versionId);
      } catch (err) {
        const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
        if (msg.includes('not found') || msg.includes('no rows')) {
          return new Response(JSON.stringify({ error: 'Agent version not found' }), { status: 404 });
        }
        console.error('Error validating agent version:', err);
        return new Response(JSON.stringify({ error: 'Failed to validate agent version' }), { status: 500 });
      }
    }

    const { data: userMessageRow, error: userMessageError } = await supabase
      .from('messages')
      .insert([{ conversation_id: conversationId, role: 'user', content: message }])
      .select('id')
      .single();

    if (userMessageError || !userMessageRow) {
      console.error('Failed to save user message', userMessageError ?? 'no row returned');
      return new Response(JSON.stringify({ error: 'Failed to save user message' }), { status: 500 });
    }

    const memories = await getRelevantMemories({ conversationId, query: message });

    const runId = await enqueueAgentRun({
      runId: '',
      userId,
      conversationId,
      message,
      workflow: workflow ?? ['Planner', 'Executor', 'Reviewer'],
      memories,
      agentVersionId: versionId ?? null,
      organizationId: executionAgent.agent.organization_id ?? null
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
