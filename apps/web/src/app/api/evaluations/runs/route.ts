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

    const supabase = createServerSupabaseClient();

    const res = await evaluations.createEvaluationRun(
      authUser.id,
      {
        datasetId: body.datasetId,
        agentVersionId: body.agentVersionId,
        organizationId: body.organizationId ?? null
      },
      supabase
    );

    return new Response(JSON.stringify({ run: res.run, results: res.results, summary: res.summary }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
