import { NextRequest } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, experiments } from '@agent-workbench/sdk';

async function handlePost(request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const body = await request.json();
    const { data: user } = await authClient.auth.getUser();
    const authUser = user?.user ?? null;
    if (!authUser) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    const supabase = createServerSupabaseClient();

    const experiment = await experiments.getExperiment(body.experimentId, supabase);
    if (!experiment) return new Response(JSON.stringify({ error: 'Experiment not found' }), { status: 404 });

    const executedExperiment = await experiments.executeExperiment(authUser.id, {
      experimentId: experiment.id,
      organizationId: experiment.organization_id ?? null
    }, supabase);

    return new Response(JSON.stringify({ experiment: executedExperiment.experiment, runA: executedExperiment.runA, runB: executedExperiment.runB }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
