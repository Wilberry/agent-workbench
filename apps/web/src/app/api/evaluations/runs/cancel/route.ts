import { NextRequest } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, evaluations, experiments } from '@agent-workbench/sdk';

function errorStatus(message: string) {
  if (message.startsWith('Not authorized')) return 403;
  if (message.endsWith('not found')) return 404;
  if (message.includes('already completed') || message.includes('already failed')) return 409;
  return 500;
}

async function handlePost(request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const body = await request.json();
    const { data: user } = await authClient.auth.getUser();
    const authUser = user?.user ?? null;
    if (!authUser) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    if (!body.runId) {
      return new Response(JSON.stringify({ error: 'runId is required' }), { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const run = await evaluations.cancelEvaluationRun(
      authUser.id,
      body.runId,
      body.reason ?? null,
      supabase
    );
    await experiments.syncExperimentStatusForRun(run.id, supabase);

    return new Response(JSON.stringify({ run }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    const message = (err as Error).message;
    return new Response(JSON.stringify({ error: message }), { status: errorStatus(message) });
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
