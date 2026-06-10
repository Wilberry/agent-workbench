import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { cookies } from 'next/headers';

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const supabase = createServerSupabaseClient({ cookies });
  const runId = params.runId;

  try {
    const { data: run, error } = await supabase
      .from('agent_runs')
      .select('id, status, current_step, created_at, execution_trace')
      .eq('id', runId)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!run) {
      return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404 });
    }

    return new Response(
      JSON.stringify({ id: run.id, status: run.status, current_step: run.current_step, created_at: run.created_at, execution_trace: run.execution_trace || [] }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), { status: 500 });
  }
}
