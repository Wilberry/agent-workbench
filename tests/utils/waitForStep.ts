import { createServerSupabaseClient } from '@agent-workbench/sdk';

export async function waitForStep(runId: string, stepName: string, timeoutMs = 15000) {
  const supabase = createServerSupabaseClient();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('execution_trace')
      .eq('id', runId)
      .single();

    if (error) {
      throw error;
    }

    const trace = (data?.execution_trace as Array<{ step: string }> | null) ?? [];
    if (trace.some((step) => step.step.toLowerCase().includes(stepName.toLowerCase()))) {
      return trace;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for step '${stepName}' on run ${runId}`);
}
