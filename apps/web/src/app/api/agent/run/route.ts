import { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { enqueueAgentRun, getRelevantMemories } from '@agent-workbench/agent-runtime';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { authorizeExecution, ExecutionAuthorizationError } from '@/lib/agentExecutionAuth';

type RunAgentBody = {
  agentId: string;
  conversationId: string;
  message: string;
  workflow?: string[];
  agentVersionId?: string | null;
};

async function handleAgentRun(request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const body = (await request.json()) as RunAgentBody;
    const { agentId, conversationId, message, workflow, agentVersionId } = body;

    if (!agentId || !conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'agentId, conversationId, and message are required' }),
        { status: 400 }
      );
    }

    const {
      data: { user }
    } = await authClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const authenticatedUserId = user.id;

    const authorization = await authorizeExecution({
      user,
      agentId,
      conversationId,
      agentVersionId
    });

    const supabase = createServerSupabaseClient();

    const { data: userMessageRow, error: userMessageError } = await supabase
      .from('messages')
      .insert([{ conversation_id: authorization.conversation.id, role: 'user', content: message }])
      .select('id')
      .single();

    if (userMessageError || !userMessageRow) {
      console.error('Failed to save user message', userMessageError ?? 'no row returned');
      return new Response(JSON.stringify({ error: 'Failed to save user message' }), { status: 500 });
    }

    const memories = await getRelevantMemories({ conversationId: authorization.conversation.id, query: message });

    const runId = await enqueueAgentRun({
      runId: '',
      userId: authenticatedUserId,
      conversationId: authorization.conversation.id,
      message,
      workflow: workflow ?? ['Planner', 'Executor', 'Reviewer'],
      memories,
      agentVersionId: authorization.agentVersion?.id ?? null,
      organizationId: authorization.agent.organization_id ?? null
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
    if (error instanceof ExecutionAuthorizationError) {
      return new Response(JSON.stringify({ error: error.message }), { status: error.status });
    }

    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleAgentRun(request);
}
