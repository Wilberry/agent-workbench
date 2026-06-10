import { NextRequest } from 'next/server';
import { enqueueAgentRun, getRelevantMemories } from '@agent-workbench/agent-runtime';

type RunAgentBody = {
  userId: string;
  conversationId: string;
  message: string;
  workflow?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunAgentBody;
    const { userId, conversationId, message, workflow } = body;

    if (!userId || !conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'userId, conversationId, and message are required' }),
        { status: 400 }
      );
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
