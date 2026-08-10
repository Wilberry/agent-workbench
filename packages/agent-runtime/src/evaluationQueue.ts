import {
  createServerSupabaseClient,
  evaluations,
  experiments
} from '@agent-workbench/sdk';

export type EvaluationRunQueueJob = {
  id: string;
  runId: string;
  userId: string;
  organizationId?: string | null;
  attempts: number;
  maxAttempts: number;
};

function parseLeaseInterval(leaseInterval: string): number {
  const match = leaseInterval.match(/^(\d+)\s*(second|seconds|minute|minutes|hour|hours)$/i);
  if (!match) throw new Error(`Unsupported lease interval: ${leaseInterval}`);

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('second')) return value * 1000;
  if (unit.startsWith('minute')) return value * 60 * 1000;
  return value * 60 * 60 * 1000;
}

export async function dequeueEvaluationRun(): Promise<EvaluationRunQueueJob | null> {
  const supabase = createServerSupabaseClient();
  // Queue migration lands independently from generated SDK types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queueClient = supabase as any;

  try {
    const { data, error } = await queueClient.rpc('dequeue_evaluation_run_job');
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        id: row.id,
        runId: row.evaluation_run_id,
        userId: row.user_id,
        organizationId: row.organization_id ?? null,
        attempts: Number(row.attempts ?? 0),
        maxAttempts: Number(row.max_attempts ?? 5)
      };
    }

    const message = String(error?.message ?? error ?? '');
    if (error && !message.includes('ambiguous') && !message.includes('invalid') && !message.includes('not found')) {
      throw error;
    }
  } catch (error) {
    const message = String((error as Error)?.message ?? error ?? '');
    if (!message.includes('ambiguous') && !message.includes('invalid') && !message.includes('not found')) {
      throw error;
    }
  }

  // Compatibility fallback for environments where the queue RPC has not been
  // refreshed in PostgREST yet. The database RPC remains the production path.
  const { data: candidate, error: selectError } = await queueClient
    .from('evaluation_run_jobs')
    .select('id,evaluation_run_id,user_id,organization_id,attempts,max_attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await queueClient
    .from('evaluation_run_jobs')
    .update({
      status: 'running',
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', candidate.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updateError) throw updateError;
  if (!claimed) return null;

  return {
    id: candidate.id,
    runId: candidate.evaluation_run_id,
    userId: candidate.user_id,
    organizationId: candidate.organization_id ?? null,
    attempts: Number(candidate.attempts ?? 0),
    maxAttempts: Number(candidate.max_attempts ?? 5)
  };
}

export async function reclaimStaleEvaluationJobs(leaseInterval = '10 minutes'): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queueClient = supabase as any;

  try {
    const { data, error } = await queueClient.rpc('reclaim_stale_evaluation_run_jobs', {
      lease_interval: leaseInterval
    });
    if (!error) {
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows.map((row) => row.id).filter(Boolean);
    }

    const message = String(error?.message ?? error ?? '');
    if (!message.includes('ambiguous') && !message.includes('invalid') && !message.includes('not found')) {
      throw error;
    }
  } catch (error) {
    const message = String((error as Error)?.message ?? error ?? '');
    if (!message.includes('ambiguous') && !message.includes('invalid') && !message.includes('not found')) {
      throw error;
    }
  }

  const cutoff = new Date(Date.now() - parseLeaseInterval(leaseInterval)).toISOString();
  const { data: rows, error: selectError } = await queueClient
    .from('evaluation_run_jobs')
    .select('id,attempts,max_attempts')
    .eq('status', 'running')
    .not('locked_at', 'is', null)
    .lt('locked_at', cutoff);

  if (selectError) throw selectError;

  const reclaimed: string[] = [];
  for (const row of rows ?? []) {
    if (Number(row.attempts) >= Number(row.max_attempts)) continue;
    const { error } = await queueClient
      .from('evaluation_run_jobs')
      .update({ status: 'pending', locked_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'running');
    if (error) throw error;
    reclaimed.push(row.id);
  }

  return reclaimed;
}

async function markEvaluationQueueJobCompleted(runId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queueClient = supabase as any;
  const { error } = await queueClient
    .from('evaluation_run_jobs')
    .update({
      status: 'completed',
      locked_at: null,
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq('evaluation_run_id', runId);
  if (error) throw error;
}

async function incrementEvaluationAttempts(
  runId: string,
  failureReason: string
): Promise<{ attempts: number; maxAttempts: number; isDead: boolean }> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queueClient = supabase as any;

  const { data: row, error: fetchError } = await queueClient
    .from('evaluation_run_jobs')
    .select('attempts,max_attempts')
    .eq('evaluation_run_id', runId)
    .single();
  if (fetchError || !row) throw fetchError ?? new Error('Evaluation queue job not found');

  const attempts = Number(row.attempts ?? 0) + 1;
  const maxAttempts = Number(row.max_attempts ?? 5);
  const isDead = attempts >= maxAttempts;

  const { error: updateError } = await queueClient
    .from('evaluation_run_jobs')
    .update({
      attempts,
      status: isDead ? 'failed' : 'pending',
      locked_at: null,
      error_message: failureReason,
      updated_at: new Date().toISOString()
    })
    .eq('evaluation_run_id', runId);
  if (updateError) throw updateError;

  return { attempts, maxAttempts, isDead };
}

export async function processEvaluationRunJob(job: EvaluationRunQueueJob): Promise<void> {
  const supabase = createServerSupabaseClient();

  try {
    await evaluations.executeEvaluationRun(job.runId, supabase);
    // Reconcile the parent experiment before completing the queue job. If
    // reconciliation fails, a retry can cheaply resume the already-completed
    // evaluation and retry only the orchestration step.
    await experiments.syncExperimentStatusForRun(job.runId, supabase);
    await markEvaluationQueueJobCompleted(job.runId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const { attempts, maxAttempts, isDead } = await incrementEvaluationAttempts(job.runId, errorMessage);
      if (isDead) {
        await evaluations.markEvaluationRunFailed(
          job.runId,
          `Evaluation failed after ${attempts}/${maxAttempts} attempts: ${errorMessage}`,
          supabase
        );
        await experiments.syncExperimentStatusForRun(job.runId, supabase);
      } else {
        await supabase.from('evaluation_runs').update({ status: 'pending' }).eq('id', job.runId);
      }
    } catch (queueError) {
      console.warn('Failed to update evaluation queue state:', queueError);
    }

    throw error;
  }
}
