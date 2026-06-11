import { createServerSupabaseClient } from '@agent-workbench/sdk';

export type WorkflowExecutionStep = {
  stepIndex: number;
  agentRole: string;
  input: string;
  output: string;
  toolsCalled: string[];
  memoryUsed: boolean;
  timestamp: string;
  modelIterations: number;
};

// Rich execution step used for persistence and realtime events
export type ExecutionStep = {
  id: string;
  run_id: string;
  step: 'planner' | 'executor' | 'reviewer' | 'tool' | 'memory' | 'error';
  status: 'started' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
    toolName?: string;
  } | null;
};

export type AgentRunQueueJob = {
  runId: string;
  userId: string;
  conversationId: string;
  message: string;
  workflow: string[];
  memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }>;
};

const processing = new Set<string>();

export async function enqueueAgentRun(job: AgentRunQueueJob): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert([
      {
        user_id: job.userId,
        conversation_id: job.conversationId,
        workflow: job.workflow,
        status: 'pending'
      }
    ])
    .select('id')
    .single();

  if (runError || !run) {
    throw runError ?? new Error('Failed to create agent run');
  }

  const { error: queueError } = await supabase.from('agent_run_jobs').insert([
    {
      run_id: run.id,
      user_id: job.userId,
      conversation_id: job.conversationId,
      message: job.message,
      workflow: job.workflow,
      memories: job.memories,
      status: 'pending'
    }
  ]);

  if (queueError) {
    throw queueError;
  }

  return run.id;
}

export async function dequeueAgentRun(): Promise<AgentRunQueueJob | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc('dequeue_agent_run_job');
  if (error) {
    throw error;
  }

  const rowCandidate = data as any;
  const row = Array.isArray(rowCandidate) ? rowCandidate[0] : rowCandidate;
  if (!row) {
    return null;
  }

  return {
    runId: row.run_id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    message: row.message,
    workflow: row.workflow,
    memories: row.memories ?? []
  };
}

export async function incrementAttemptsAndMaybeDead(runId: string, failureReason?: string): Promise<{ attempts: number; maxAttempts: number; isDead: boolean }> {
  const supabase = createServerSupabaseClient();

  const { data: row, error: fetchErr } = await supabase
    .from('agent_run_jobs')
    .select('attempts, max_attempts')
    .eq('run_id', runId)
    .single();

  if (fetchErr || !row) {
    throw fetchErr ?? new Error('Queue job not found for attempts increment');
  }

  const attempts = (row.attempts as number) + 1;
  const maxAttempts = row.max_attempts as number;

  const { error: updateErr } = await supabase
    .from('agent_run_jobs')
    .update({ attempts, updated_at: new Date().toISOString(), error_message: failureReason ?? null, locked_at: null })
    .eq('run_id', runId);

  if (updateErr) throw updateErr;

  const isDead = attempts >= maxAttempts;
  if (isDead) {
    // mark final status as failed/dead
    const { error: deadErr } = await supabase
      .from('agent_run_jobs')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('run_id', runId);

    if (deadErr) throw deadErr;
  } else {
    // requeue for retry
    const { error: requeueErr } = await supabase
      .from('agent_run_jobs')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('run_id', runId);

    if (requeueErr) throw requeueErr;
  }

  return { attempts, maxAttempts, isDead };
}

export async function reclaimStaleJobs(leaseInterval = '5 minutes'): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('reclaim_stale_agent_run_jobs', { lease_interval: leaseInterval });
  if (error) throw error;

  const rows = data as any;
  if (!rows) return [];
  const ids = Array.isArray(rows) ? rows.map((r: any) => r.id) : [rows.id];
  return ids;
}

export async function markQueueJobCompleted(runId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('agent_run_jobs')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('run_id', runId);

  if (error) throw error;
}

export async function markQueueJobFailed(runId: string, failureReason?: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('agent_run_jobs')
    .update({ status: 'failed', updated_at: new Date().toISOString(), error_message: failureReason ?? null })
    .eq('run_id', runId);

  if (error) throw error;
}

export function isProcessing(runId: string): boolean {
  return processing.has(runId);
}

export function setProcessing(runId: string, isProcessing: boolean): void {
  if (isProcessing) {
    processing.add(runId);
  } else {
    processing.delete(runId);
  }
}

export async function persistExecutionStep(runId: string, step: ExecutionStep): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { data: run, error: fetchError } = await supabase
    .from('agent_runs')
    .select('execution_trace, current_step')
    .eq('id', runId)
    .single();

  if (fetchError || !run) {
    throw fetchError ?? new Error('Run not found');
  }

  const trace = (run.execution_trace as any[]) || [];
  trace.push(step);

  const { error: updateError } = await supabase
    .from('agent_runs')
    .update({
      execution_trace: trace,
      current_step: (run.current_step || 0) + 1
    })
    .eq('id', runId);

  if (updateError) {
    throw updateError;
  }

  try {
    // @ts-ignore - runtime API
    await supabase.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'execution_step',
      payload: step
    });
  } catch (err) {
    console.warn('Failed to broadcast execution_step:', err);
  }
}

export async function markRunCompleted(runId: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('agent_runs')
    .update({ status: 'completed' })
    .eq('id', runId);

  if (error) {
    throw error;
  }

  try {
    // @ts-ignore
    await supabase.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'run_completed',
      payload: { runId, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    console.warn('Failed to broadcast run_completed:', err);
  }
}

export async function markRunFailed(runId: string, errorMessage: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('agent_runs')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', runId);

  if (error) {
    throw error;
  }

  try {
    // @ts-ignore
    await supabase.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'run_failed',
      payload: { runId, error: errorMessage, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    console.warn('Failed to broadcast run_failed:', err);
  }
}

export async function getAgentRun(runId: string) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
