import { NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { headers, cookies } from 'next/headers';
import { experiments } from '@agent-workbench/sdk';

async function handlePost(request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const body = await request.json();
    const { data: user } = await authClient.auth.getUser();
    const authUser = user?.user ?? null;
    if (!authUser) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    const createdExperiment = await experiments.createExperiment(authUser.id, {
      name: body.name,
      agentId: body.agentId,
      versionAId: body.versionAId,
      versionBId: body.versionBId,
      datasetId: body.datasetId,
      organizationId: body.organizationId ?? null
    });

    return new Response(JSON.stringify({ experiment: createdExperiment }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}

async function handleGet(_request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const { data: user } = await authClient.auth.getUser();
    const authUser = user?.user ?? null;
    if (!authUser) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    const experimentList = await experiments.listExperiments(authUser.id);
    return new Response(JSON.stringify({ experiments: experimentList }), {
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

export async function GET(request: NextRequest) {
  return handleGet(request);
}
