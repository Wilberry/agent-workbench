import { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { enqueueAgentRun, getRelevantMemories } from '@agent-workbench/agent-runtime';
import { createServerSupabaseClient, orgs } from '@agent-workbench/sdk';
import { authorizeExecution, ExecutionAuthorizationError, QuotaExceededError } from '@/lib/agentExecutionAuth';

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

    const organizationId = authorization.agent.organization_id ?? null;

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

    const requestedWorkflow = Array.isArray(workflow) && workflow.length > 0
      ? workflow
      : authorization.agentVersion?.workflow ?? ['Planner', 'Executor', 'Reviewer'];

    const memories = await getRelevantMemories({ conversationId: authorization.conversation.id, query: message });
    const runId = randomUUID();

    await orgs.reserveQuota(organizationId, runId, { estimatedCost: 0 });

    await enqueueAgentRun({
      runId,
      userId: authenticatedUserId,
      conversationId: authorization.conversation.id,
      message,
      workflow: requestedWorkflow,
      memories,
      agentVersionId: authorization.agentVersion?.id ?? null,
      organizationId: organizationId
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

    if (error instanceof QuotaExceededError) {
      return new Response(
        JSON.stringify({ error: error.code, message: error.message }),
        { status: error.status }
      );
    }

    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleAgentRun(request);
}
