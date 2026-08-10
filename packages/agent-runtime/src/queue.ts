import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import type { LLMToolLoopCheckpoint } from './toolExecution';

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

export type ExecutionStep = {
  id: string;
  run_id: string;
  step: 'planner' | 'executor' | 'reviewer' | 'tool' | 'memory' | 'error' | 'checkpoint';
  status: 'started' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
    toolName?: string;
    latency_ms?: number;
    stepIndex?: number;
    role?: string;
    checkpoint?: LLMToolLoopCheckpoint;
  } | null;
};

export type AgentRunQueueJob = {
  runId: string;
  userId: string;
  conversationId: string;
  message: string;
  workflow: string[];
  memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }>;
  agentVersionId?: string | null;
  organizationId?: string | null;
};

const processing = new Set<string>();

export async function enqueueAgentRun(job: AgentRunQueueJob): Promise<string> {
  const supabase = createServerSupabaseClient();
  const runPayload = {
    user_id: job.userId,
    conversation_id: job.conversationId,
    workflow: job.workflow,
    agent_version_id: job.agentVersionId ?? null,
    organization_id: job.organizationId ?? null,
    status: 'pending',
    ...(job.runId ? { id: job.runId } : {})
  } as const;

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert([runPayload])
    .select('id')
    .single();
  if (runError || !run) throw runError ?? new Error('Failed to create agent run');

  const { error: queueError } = await supabase.from('agent_run_jobs').insert([{
    run_id: run.id,
    user_id: job.userId,
    conversation_id: job.conversationId,
    message: job.message,
    workflow: job.workflow,
    memories: job.memories,
    status: 'pending'
  }]);
  if (queueError) {
    console.error('Failed to enqueue agent run job', { queueError, job });
    throw queueError;
  }
  return run.id;
}

export async function dequeueAgentRun(userId?: string): Promise<AgentRunQueueJob | null> {
  const supabase = createServerSupabaseClient();
  let rpcError: any;

  if (!userId) {
    try {
      const { data, error } = await supabase.rpc('dequeue_agent_run_job');
      if (!error && data) {
        const rowCandidate = data as any;
        const row = Array.isArray(rowCandidate) ? rowCandidate[0] : rowCandidate;
        if (!row) return null;
        return {
          runId: row.run_id,
          userId: row.user_id,
          conversationId: row.conversation_id,
          message: row.message,
          workflow: row.workflow,
          memories: row.memories ?? []
        };
      }
      rpcError = error;
    } catch (err) {
      rpcError = err;
    }

    const errorMessage = String(rpcError?.message ?? rpcError ?? '');
    if (!errorMessage.includes('ambiguous') && !errorMessage.includes('invalid')) {
      if (rpcError) throw rpcError;
      return null;
    }
  }

  const query = supabase
    .from('agent_run_jobs')
    .select('id, run_id, user_id, conversation_id, message, workflow, memories')
    .eq('status', 'pending');
  if (userId) query.eq('user_id', userId);

  const { data: candidate, error: selectError } = await query
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await supabase
    .from('agent_run_jobs')
    .update({ status: 'running', locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', candidate.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!claimed) return null;

  return {
    runId: candidate.run_id,
    userId: candidate.user_id,
    conversationId: candidate.conversation_id,
    message: candidate.message,
    workflow: candidate.workflow,
    memories: candidate.memories ?? []
  };
}

function parseLeaseInterval(leaseInterval: string): number {
  const match = leaseInterval.match(/^(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days)$/i);
  if (!match) throw new Error(`Unsupported lease interval: ${leaseInterval}`);
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'second':
    case 'seconds': return value * 1000;
    case 'minute':
    case 'minutes': return value * 60 * 1000;
    case 'hour':
    case 'hours': return value * 60 * 60 * 1000;
    case 'day':
    case 'days': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unsupported lease interval unit: ${unit}`);
  }
}

export async function incrementAttemptsAndMaybeDead(
  runId: string,
  failureReason?: string
): Promise<{ attempts: number; maxAttempts: number; isDead: boolean; wasCancelled: boolean }> {
  const supabase = createServerSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from('agent_run_jobs')
    .select('attempts, max_attempts, status')
    .eq('run_id', runId)
    .single();
  if (fetchErr || !row) throw fetchErr ?? new Error('Queue job not found for attempts increment');

  if (String(row.status) === 'cancelled') {
    return {
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 0),
      isDead: false,
      wasCancelled: true
    };
  }

  const attempts = Number(row.attempts ?? 0) + 1;
  const maxAttempts = Number(row.max_attempts ?? 0);
  const isDead = attempts >= maxAttempts;
  const { error: updateErr } = await supabase
    .from('agent_run_jobs')
    .update({
      attempts,
      status: isDead ? 'failed' : 'pending',
      updated_at: new Date().toISOString(),
      error_message: failureReason ?? null,
      locked_at: null
    })
    .eq('run_id', runId)
    .neq('status', 'cancelled' as any);
  if (updateErr) throw updateErr;
  return { attempts, maxAttempts, isDead, wasCancelled: false };
}

export async function reclaimStaleJobs(leaseInterval = '5 minutes'): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  let rpcError: any;
  try {
    const { data, error } = await supabase.rpc('reclaim_stale_agent_run_jobs', { lease_interval: leaseInterval });
    if (!error && data) {
      const rows = data as any;
      if (!rows) return [];
      return Array.isArray(rows) ? rows.map((r: any) => r.id) : [rows.id];
    }
    rpcError = error;
  } catch (err) {
    rpcError = err;
  }

  const errorMessage = String(rpcError?.message ?? rpcError ?? '');
  if (!errorMessage.includes('ambiguous') && !errorMessage.includes('invalid')) throw rpcError;

  const cutoff = new Date(Date.now() - parseLeaseInterval(leaseInterval)).toISOString();
  const { data: rows, error: selectError } = await supabase
    .from('agent_run_jobs')
    .select('id, attempts, max_attempts')
    .eq('status', 'running')
    .not('locked_at', 'is', null)
    .lt('locked_at', cutoff);
  if (selectError) throw selectError;

  const staleRows = Array.isArray(rows) ? rows.filter((row: any) => row.attempts < row.max_attempts) : [];
  const ids: string[] = [];
  for (const row of staleRows) {
    const { data: reclaimed, error: updateError } = await supabase
      .from('agent_run_jobs')
      .update({ status: 'pending', locked_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'running')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (reclaimed) ids.push(row.id);
  }
  return ids;
}

export async function markQueueJobCompleted(runId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('agent_run_jobs')
    .update({ status: 'completed', locked_at: null, updated_at: new Date().toISOString() })
    .eq('run_id', runId)
    .neq('status', 'cancelled' as any);
  if (error) throw error;
}

export async function markQueueJobFailed(runId: string, failureReason?: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('agent_run_jobs')
    .update({ status: 'failed', locked_at: null, updated_at: new Date().toISOString(), error_message: failureReason ?? null })
    .eq('run_id', runId)
    .neq('status', 'cancelled' as any);
  if (error) throw error;
}

export async function markQueueJobCancelled(runId: string, reason?: string | null): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const cancelledAt = new Date().toISOString();
  const { error } = await runtimeClient
    .from('agent_run_jobs')
    .update({
      status: 'cancelled',
      locked_at: null,
      cancelled_at: cancelledAt,
      error_message: reason?.trim() || 'Cancelled',
      updated_at: cancelledAt
    })
    .eq('run_id', runId)
    .in('status', ['pending', 'running']);
  if (error) throw error;
}

export type RunTelemetryUpdate = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  latency_ms?: number;
  model_name?: string | null;
  provider_name?: string | null;
};

export async function updateRunTelemetry(runId: string, telemetry: RunTelemetryUpdate): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('agent_runs').update(telemetry).eq('id', runId);
  if (error) console.warn('Failed to update run telemetry:', error);
}

export async function persistToolCall(params: {
  runId: string;
  organizationId?: string | null;
  toolName: string;
  status: 'success' | 'failed';
  latencyMs: number;
  inputPayload: Record<string, unknown>;
  outputPayload: unknown;
}): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('tool_calls').insert([{
    run_id: params.runId,
    organization_id: params.organizationId ?? null,
    tool_name: params.toolName,
    status: params.status,
    latency_ms: params.latencyMs,
    input_payload: params.inputPayload,
    output_payload: params.outputPayload ?? {}
  }]);
  if (error) console.warn('Failed to persist tool call audit:', error);
}

export function isProcessing(runId: string): boolean {
  return processing.has(runId);
}

export function setProcessing(runId: string, isRunProcessing: boolean): void {
  if (isRunProcessing) processing.add(runId);
  else processing.delete(runId);
}

function traceEntries(trace: unknown): ExecutionStep[] {
  return Array.isArray(trace) ? trace as ExecutionStep[] : [];
}

function isCompletedWorkflowStep(entry: ExecutionStep, stepIndex: number): boolean {
  return entry.status === 'completed' &&
    entry.step !== 'checkpoint' &&
    entry.metadata?.stepIndex === stepIndex;
}

export function getRunCheckpoint(trace: unknown, stepIndex: number, role?: string): LLMToolLoopCheckpoint | null {
  const entries = traceEntries(trace).filter((entry) =>
    entry?.step === 'checkpoint' &&
    entry?.status === 'completed' &&
    entry?.metadata?.stepIndex === stepIndex &&
    (!role || entry?.metadata?.role === role)
  );
  const checkpoint = entries[entries.length - 1]?.metadata?.checkpoint;
  return checkpoint?.version === 1 ? checkpoint : null;
}

export function rebuildWorkflowEpisode(trace: unknown, currentStep: number): string[] {
  const completed = traceEntries(trace).filter((entry) =>
    entry?.status === 'completed' &&
    entry?.step !== 'checkpoint' &&
    entry?.step !== 'tool' &&
    entry?.step !== 'memory' &&
    entry?.step !== 'error' &&
    typeof entry?.output === 'string'
  );
  const explicitlyIndexed = completed
    .filter((entry) => typeof entry.metadata?.stepIndex === 'number' && entry.metadata.stepIndex < currentStep)
    .sort((a, b) => Number(a.metadata?.stepIndex) - Number(b.metadata?.stepIndex));
  const selected = explicitlyIndexed.length > 0 ? explicitlyIndexed : completed.slice(0, currentStep);
  return selected.map((entry) => `${String(entry.step).toUpperCase()} OUTPUT:\n${String(entry.output)}`);
}

export async function persistRunCheckpoint(
  runId: string,
  stepIndex: number,
  role: string,
  checkpoint: LLMToolLoopCheckpoint
): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const { data: run, error: fetchError } = await runtimeClient
    .from('agent_runs')
    .select('execution_trace, status')
    .eq('id', runId)
    .single();
  if (fetchError || !run) throw fetchError ?? new Error('Run not found');
  if (String(run.status) === 'cancelled') throw new Error('agent_run_cancelled');

  const trace = traceEntries(run.execution_trace).filter((entry) => !(
    entry.step === 'checkpoint' && entry.metadata?.stepIndex === stepIndex
  ));
  const entry: ExecutionStep = {
    id: randomUUID(),
    run_id: runId,
    step: 'checkpoint',
    status: 'completed',
    timestamp: new Date().toISOString(),
    metadata: { stepIndex, role, checkpoint }
  };
  trace.push(entry);

  const { data: updated, error: updateError } = await runtimeClient
    .from('agent_runs')
    .update({ execution_trace: trace })
    .eq('id', runId)
    .neq('status', 'cancelled')
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error('agent_run_cancelled');
}

export async function clearRunCheckpoint(runId: string, stepIndex: number): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const { data: run, error: fetchError } = await runtimeClient
    .from('agent_runs')
    .select('execution_trace, status')
    .eq('id', runId)
    .single();
  if (fetchError || !run) throw fetchError ?? new Error('Run not found');
  if (String(run.status) === 'cancelled') return;

  const trace = traceEntries(run.execution_trace).filter((entry) => !(
    entry.step === 'checkpoint' && entry.metadata?.stepIndex === stepIndex
  ));
  const { error } = await runtimeClient
    .from('agent_runs')
    .update({ execution_trace: trace })
    .eq('id', runId)
    .neq('status', 'cancelled');
  if (error) throw error;
}

export async function persistExecutionStep(runId: string, step: ExecutionStep): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const { data: run, error: fetchError } = await runtimeClient
    .from('agent_runs')
    .select('execution_trace, current_step, status')
    .eq('id', runId)
    .single();
  if (fetchError || !run) throw fetchError ?? new Error('Run not found');
  if (String(run.status) === 'cancelled') throw new Error('agent_run_cancelled');

  const trace = traceEntries(run.execution_trace);
  const stepIndex = step.metadata?.stepIndex;
  const indexedStep = typeof stepIndex === 'number';
  const currentStep = Number(run.current_step ?? 0);

  if (indexedStep && step.status === 'completed') {
    const targetStep = stepIndex + 1;
    if (trace.some((entry) => isCompletedWorkflowStep(entry, stepIndex))) return;
    if (currentStep > stepIndex) {
      throw new Error(`Run cursor advanced past unpersisted step ${stepIndex}`);
    }

    const nextTrace = [...trace, step];
    const { data: updated, error: updateError } = await runtimeClient
      .from('agent_runs')
      .update({ execution_trace: nextTrace, current_step: targetStep })
      .eq('id', runId)
      .eq('current_step', currentStep)
      .neq('status', 'cancelled')
      .select('id')
      .maybeSingle();

    if (updateError || !updated) {
      const { data: latest, error: latestError } = await runtimeClient
        .from('agent_runs')
        .select('execution_trace, current_step, status')
        .eq('id', runId)
        .single();
      if (!latestError && latest) {
        if (String(latest.status) === 'cancelled') throw new Error('agent_run_cancelled');
        const latestTrace = traceEntries(latest.execution_trace);
        if (
          Number(latest.current_step ?? 0) >= targetStep &&
          latestTrace.some((entry) => isCompletedWorkflowStep(entry, stepIndex))
        ) {
          return;
        }
      }
      if (updateError) throw updateError;
      if (latestError) throw latestError;
      throw new Error(`Run cursor changed while persisting step ${stepIndex}`);
    }
  } else {
    const nextTrace = [...trace, step];
    const targetStep = indexedStep
      ? stepIndex
      : currentStep + 1;
    const { data: updated, error: updateError } = await runtimeClient
      .from('agent_runs')
      .update({ execution_trace: nextTrace, current_step: targetStep })
      .eq('id', runId)
      .neq('status', 'cancelled')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error('agent_run_cancelled');
  }

  try {
    await runtimeClient.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'execution_step',
      payload: step
    });
  } catch (err) {
    console.warn('Failed to broadcast execution_step:', err);
  }
}

export async function markRunCompleted(runId: string): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const { data: run, error: fetchError } = await runtimeClient
    .from('agent_runs')
    .select('id, organization_id, total_tokens, estimated_cost, status')
    .eq('id', runId)
    .single();
  if (fetchError || !run) {
    console.warn('Failed to fetch run for usage recording:', fetchError?.message ?? 'not found');
    return;
  }
  if (String(run.status) === 'cancelled' || String(run.status) === 'completed') return;

  const { data: completed, error } = await runtimeClient
    .from('agent_runs')
    .update({ status: 'completed' })
    .eq('id', runId)
    .neq('status', 'cancelled')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!completed) return;

  if (run.organization_id) {
    try {
      const { orgs } = await import('@agent-workbench/sdk');
      await orgs.recordUsageOnCompletion(
        run.organization_id,
        runId,
        { tokens: run.total_tokens ?? 0, estimatedCost: run.estimated_cost ?? 0 }
      );
    } catch (usageError) {
      console.warn('Failed to record run usage:', usageError instanceof Error ? usageError.message : String(usageError));
    }
  }

  try {
    await runtimeClient.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'run_completed',
      payload: { runId, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    console.warn('Failed to broadcast run_completed:', err);
  }
}

export async function markRunFailed(runId: string, errorMessage: string): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const { data: run, error: fetchError } = await runtimeClient
    .from('agent_runs')
    .select('id, organization_id, status')
    .eq('id', runId)
    .single();
  if (fetchError) console.warn('Failed to fetch run for failure recording:', fetchError.message);
  if (!run || String(run.status) === 'cancelled' || String(run.status) === 'failed') return;

  const { data: failed, error } = await runtimeClient
    .from('agent_runs')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', runId)
    .neq('status', 'cancelled')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!failed) return;

  if (run.organization_id) {
    try {
      const { orgs } = await import('@agent-workbench/sdk');
      await orgs.recordRunFailure(run.organization_id, runId, { reason: errorMessage });
    } catch (failureError) {
      console.warn('Failed to record run failure:', failureError instanceof Error ? failureError.message : String(failureError));
    }
  }

  try {
    await runtimeClient.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'run_failed',
      payload: { runId, error: errorMessage, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    console.warn('Failed to broadcast run_failed:', err);
  }
}

export async function markRunCancelled(runId: string, reason?: string | null): Promise<void> {
  const runtimeClient = createServerSupabaseClient() as any;
  const cancelledAt = new Date().toISOString();
  const cancellationReason = reason?.trim() || null;
  const { error } = await runtimeClient
    .from('agent_runs')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      cancellation_reason: cancellationReason,
      error_message: cancellationReason
    })
    .eq('id', runId)
    .in('status', ['pending', 'running']);
  if (error) throw error;

  try {
    await runtimeClient.channel(`run:${runId}`).send({
      type: 'broadcast',
      event: 'run_cancelled',
      payload: { runId, reason: cancellationReason, timestamp: cancelledAt }
    });
  } catch (err) {
    console.warn('Failed to broadcast run_cancelled:', err);
  }
}

export async function getAgentRun(runId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', runId)
    .single();
  if (error) throw error;
  return data;
}
