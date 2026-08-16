import { createServerSupabaseClient } from '@agent-workbench/sdk';
import type { EvaluationRunQueueJob } from './evaluationQueue';
import type { AgentRunQueueJob } from './queue';

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export async function dequeueAgentRunAfter(notBefore: string): Promise<AgentRunQueueJob | null> {
  const supabase = createServerSupabaseClient() as any;
  const { data, error } = await supabase.rpc('dequeue_agent_run_job_after', {
    p_not_before: notBefore
  });
  if (error) throw error;

  const row = firstRow<any>(data);
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

export async function reclaimStaleAgentRunJobsAfter(
  notBefore: string,
  leaseInterval = '5 minutes'
): Promise<string[]> {
  const supabase = createServerSupabaseClient() as any;
  const { data, error } = await supabase.rpc('reclaim_stale_agent_run_jobs_after', {
    p_not_before: notBefore,
    p_lease_interval: leaseInterval
  });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((row: any) => row.id).filter(Boolean);
}

export async function dequeueEvaluationRunAfter(
  notBefore: string
): Promise<EvaluationRunQueueJob | null> {
  const supabase = createServerSupabaseClient() as any;
  const { data, error } = await supabase.rpc('dequeue_evaluation_run_job_after', {
    p_not_before: notBefore
  });
  if (error) throw error;

  const row = firstRow<any>(data);
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

export async function reclaimStaleEvaluationRunJobsAfter(
  notBefore: string,
  leaseInterval = '10 minutes'
): Promise<string[]> {
  const supabase = createServerSupabaseClient() as any;
  const { data, error } = await supabase.rpc('reclaim_stale_evaluation_run_jobs_after', {
    p_not_before: notBefore,
    p_lease_interval: leaseInterval
  });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((row: any) => row.id).filter(Boolean);
}
