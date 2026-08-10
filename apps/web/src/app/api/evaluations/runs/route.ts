import { NextRequest } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, evaluations } from '@agent-workbench/sdk';

async function handlePost(request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const body = await request.json();
    const { data: user } = await authClient.auth.getUser();
    const authUser = user?.user ?? null;
    if (!authUser) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    if (!body.datasetId || !body.agentVersionId) {
      return new Response(JSON.stringify({ error: 'datasetId and agentVersionId are required' }), { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { run } = await evaluations.createEvaluationRun(
      authUser.id,
      {
        datasetId: body.datasetId,
        agentVersionId: body.agentVersionId,
        organizationId: body.organizationId ?? null
      },
      supabase
    );

    return new Response(
      JSON.stringify({
        run,
        runId: run.id,
        status: run.status,
        message: 'Evaluation run queued for background execution'
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
