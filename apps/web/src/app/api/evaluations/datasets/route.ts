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

    const dataset = await evaluations.createDataset(
      authUser.id,
      {
        organizationId: body.organizationId ?? null,
        agentId: body.agentId ?? null,
        name: body.name,
        description: body.description ?? null,
        tags: body.tags ?? [],
        metadata: body.metadata ?? {}
      },
      supabase
    );

    return new Response(JSON.stringify({ dataset }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const authRes = await supabase.auth.getUser();
    const user = authRes?.data?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    const datasets = await evaluations.listDatasets(user.id, {}, supabase);
    return new Response(JSON.stringify({ datasets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}
