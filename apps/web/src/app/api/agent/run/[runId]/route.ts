import type { NextRequest } from 'next/server';
import { agentRuns } from '@agent-workbench/sdk';

type Params = {
  params: {
    runId: string;
  };
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { runId } = params;

    if (!runId) {
      return new Response(JSON.stringify({ error: 'runId is required' }), { status: 400 });
    }

    const run = await agentRuns.get(runId);

    return new Response(JSON.stringify(run), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}
