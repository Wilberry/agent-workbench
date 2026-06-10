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

const jobQueue: AgentRunQueueJob[] = [];
const processing = new Set<string>();

export async function enqueueAgentRun(job: AgentRunQueueJob): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data: run, error } = await supabase
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

  if (error || !run) {
    throw error ?? new Error('Failed to create agent run');
  }

  jobQueue.push({ ...job, runId: run.id });
  return run.id;
}

export async function dequeueAgentRun(): Promise<AgentRunQueueJob | null> {
  return jobQueue.shift() ?? null;
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

  // Emit realtime broadcast for this step
  try {
    // channel name follows spec: run:{runId}
    // send a broadcast message with event 'execution_step'
    // supabase.channel(...).send returns a promise in v2
    // ignore result but catch errors to avoid crashing the worker
    // @ts-ignore - runtime API
    await supabase.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'execution_step',
      payload: step
    });
  } catch (err) {
    // Non-fatal - log and continue
    // eslint-disable-next-line no-console
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
    // broadcast run completion
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
    // broadcast run failure
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
