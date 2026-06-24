import { NextRequest } from 'next/server';
import { createServerSupabaseClient, experiments } from '@agent-workbench/sdk';

export async function GET(_request: NextRequest, { params }: { params: { experimentId: string } }) {
  try {
    const supabase = createServerSupabaseClient();
    const experiment = await experiments.getExperiment(params.experimentId, supabase);

    if (!experiment) {
      return new Response(JSON.stringify({ error: 'Experiment not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ experiment }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}
