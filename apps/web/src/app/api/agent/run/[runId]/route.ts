import type { NextRequest } from 'next/server';
import { agentRuns, createServerSupabaseClient } from '@agent-workbench/sdk';

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

    // Fetch run events for richer replay reconstruction
    const supabase = createServerSupabaseClient();
    const { data: eventsData, error: eventsError } = await supabase
      .from('agent_run_events')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    const runEvents = eventsError ? [] : eventsData ?? [];

    return new Response(JSON.stringify({ ...run, run_events: runEvents }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
}
