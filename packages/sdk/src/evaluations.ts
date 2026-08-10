import { createServerSupabaseClient } from './supabaseClient';
import { agents } from './agents';
import type {
  Database,
  EvaluationDataset,
  EvaluationDatasetExample,
  EvaluationRun,
  EvaluationRunResult
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export class EvaluationRunCancelledError extends Error {
  code = 'EVALUATION_RUN_CANCELLED';

  constructor(public readonly runId: string) {
    super(`Evaluation run ${runId} was cancelled`);
    this.name = 'EvaluationRunCancelledError';
  }
}

function normalizeEvaluationRunSummary(results: Array<{ exact_match: boolean }>) {
  const total = results.length;
  const passed = results.filter((result) => result.exact_match).length;
  return {
    processed_examples: total,
    exact_match_count: passed,
    exact_match_rate: total > 0 ? passed / total : 0
  };
}

function normalizeTextValue(value: unknown) {
  try {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }

    if (value && typeof value === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asAny = value as any;
      if (typeof asAny.text === 'string') {
        return asAny.text.trim().toLowerCase();
      }
      return JSON.stringify(value).trim().toLowerCase();
    }

    return String(value).trim().toLowerCase();
  } catch {
    return String(value ?? '').trim().toLowerCase();
  }
}

async function assertEvaluationRunNotCancelled(
  supabase: SupabaseClient<Database>,
  runId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('evaluation_runs')
    .select('status')
    .eq('id', runId)
    .single();

  if (error) throw error;
  if (data.status === 'cancelled') {
    throw new EvaluationRunCancelledError(runId);
  }
}

export function buildEvaluationRunSummary(
  results: EvaluationRunResult[],
  totalExamples: number
): Record<string, unknown> {
  const normalizedSummary = normalizeEvaluationRunSummary(results);
  let totalLatencyMs = 0;
  let totalTokens = 0;
  let totalEstimatedCost = 0;
  const toolsUsed: string[] = [];
  const agentsUsed: string[] = [];

  for (const result of results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trace = (result.details as any)?.trace ?? {};
    totalLatencyMs += Number(trace.latency_ms ?? 0);
    totalTokens += Number(trace.total_tokens ?? 0);
    totalEstimatedCost += Number(trace.estimated_cost ?? 0);

    if (Array.isArray(trace.toolsCalled)) {
      toolsUsed.push(...trace.toolsCalled.filter((name: unknown) => typeof name === 'string'));
    }
    if (Array.isArray(trace.agentsUsed)) {
      agentsUsed.push(...trace.agentsUsed.filter((name: unknown) => typeof name === 'string'));
    }
  }

  const processedExamples = results.length;
  return {
    ...normalizedSummary,
    total_examples: totalExamples,
    remaining_examples: Math.max(0, totalExamples - processedExamples),
    progress: totalExamples > 0 ? processedExamples / totalExamples : 1,
    average_latency_ms: processedExamples ? totalLatencyMs / processedExamples : 0,
    average_tokens: processedExamples ? totalTokens / processedExamples : 0,
    estimated_cost: totalEstimatedCost,
    trace: {
      toolsCalled: Array.from(new Set(toolsUsed)),
      agentsUsed: Array.from(new Set(agentsUsed))
    }
  };
}

export const evaluations = {
  async createDataset(
    userId: string,
    payload: {
      organizationId?: string | null;
      agentId?: string | null;
      name: string;
      description?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('evaluation_datasets')
      .insert([
        {
          user_id: userId,
          organization_id: payload.organizationId ?? null,
          agent_id: payload.agentId ?? null,
          name: payload.name,
          description: payload.description ?? null,
          tags: payload.tags ?? [],
          metadata: payload.metadata ?? {}
        }
      ])
      .select('*')
      .single();

    if (error) throw error;
    return data as EvaluationDataset;
  },

  async addDatasetExamples(
    datasetId: string,
    examples: Array<{
      input: Record<string, unknown>;
      expectedOutput: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();

    const payload = examples.map((example, index) => ({
      dataset_id: datasetId,
      example_index: index,
      input: example.input,
      expected_output: example.expectedOutput,
      metadata: example.metadata ?? {}
    }));

    const { data, error } = await supabase
      .from('evaluation_dataset_examples')
      .insert(payload)
      .select('*');

    if (error) throw error;
    return data as EvaluationDatasetExample[];
  },

  async getDataset(datasetId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('evaluation_datasets')
      .select('*')
      .eq('id', datasetId)
      .single();

    if (error) throw error;
    return data as EvaluationDataset;
  },

  async listDatasets(
    userId?: string,
    options?: { organizationId?: string | null },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    let query = supabase.from('evaluation_datasets').select('*').order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId}${options?.organizationId ? `,organization_id.eq.${options.organizationId}` : ''}`);
    } else if (options?.organizationId) {
      query = query.eq('organization_id', options.organizationId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as EvaluationDataset[];
  },

  async listDatasetExamples(datasetId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('evaluation_dataset_examples')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('example_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as EvaluationDatasetExample[];
  },

  async getDatasetExamplesByIds(exampleIds: string[], client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('evaluation_dataset_examples')
      .select('*')
      .in('id', exampleIds);

    if (error) throw error;
    return (data ?? []) as EvaluationDatasetExample[];
  },

  async listDatasetExampleCounts(client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase.from('evaluation_dataset_examples').select('dataset_id');

    if (error) throw error;

    return (data ?? []).reduce<Record<string, number>>((acc, row) => {
      if (!row?.dataset_id) return acc;
      acc[row.dataset_id] = (acc[row.dataset_id] ?? 0) + 1;
      return acc;
    }, {});
  },

  async listEvaluationRuns(
    options?: {
      datasetId?: string;
      agentVersionId?: string;
      userId?: string;
      limit?: number;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    let query = supabase.from('evaluation_runs').select('*').order('created_at', { ascending: false });

    if (options?.datasetId) query = query.eq('dataset_id', options.datasetId);
    if (options?.agentVersionId) query = query.eq('agent_version_id', options.agentVersionId);
    if (options?.userId) query = query.eq('user_id', options.userId);
    if (options?.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as EvaluationRun[];
  },

  async assertEvaluationRunAccess(
    userId: string,
    runId: string,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: run, error } = await supabase
      .from('evaluation_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle();

    if (error) throw error;
    if (!run) throw new Error('Evaluation run not found');
    if (run.user_id === userId) return run as EvaluationRun;

    if (run.organization_id) {
      const { data: membership, error: membershipError } = await supabase
        .from('organization_memberships')
        .select('id')
        .eq('org_id', run.organization_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (membership) return run as EvaluationRun;
    }

    throw new Error('Not authorized to access this evaluation run');
  },

  /**
   * Create and enqueue an evaluation run. Execution happens in the runtime worker.
   */
  async createEvaluationRun(
    userId: string,
    payload: {
      datasetId: string;
      agentVersionId: string;
      organizationId?: string | null;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();

    const { data: dataset, error: datasetError } = await supabase
      .from('evaluation_datasets')
      .select('*')
      .eq('id', payload.datasetId)
      .single();
    if (datasetError || !dataset) throw datasetError ?? new Error('Dataset not found');

    const agentVersion = await agents.getVersion(payload.agentVersionId, supabase);
    if (!agentVersion) throw new Error('Agent version not found');
    if (dataset.agent_id && dataset.agent_id !== agentVersion.agent_id) {
      throw new Error('Agent version does not belong to the evaluation dataset agent');
    }

    const { data: examples, error: examplesError } = await supabase
      .from('evaluation_dataset_examples')
      .select('id')
      .eq('dataset_id', payload.datasetId);
    if (examplesError) throw examplesError;

    const totalExamples = examples?.length ?? 0;
    const organizationId = payload.organizationId ?? dataset.organization_id ?? null;
    const summary = buildEvaluationRunSummary([], totalExamples);

    const { data: run, error: runError } = await supabase
      .from('evaluation_runs')
      .insert([
        {
          dataset_id: payload.datasetId,
          agent_version_id: payload.agentVersionId,
          user_id: userId,
          organization_id: organizationId,
          status: 'pending',
          summary
        }
      ])
      .select('*')
      .single();

    if (runError || !run) throw runError ?? new Error('Failed to create evaluation run');

    // The queue table is introduced independently from generated SDK types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queueClient = supabase as any;
    const { error: queueError } = await queueClient.from('evaluation_run_jobs').insert([
      {
        evaluation_run_id: run.id,
        user_id: userId,
        organization_id: organizationId,
        status: 'pending'
      }
    ]);

    if (queueError) {
      await supabase
        .from('evaluation_runs')
        .update({
          status: 'failed',
          summary: { ...summary, error: queueError.message ?? String(queueError) }
        })
        .eq('id', run.id);
      throw queueError;
    }

    return { run: { ...(run as EvaluationRun), status: 'pending', summary } as EvaluationRun };
  },

  async cancelEvaluationRun(
    userId: string,
    runId: string,
    reason?: string | null,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const run = await this.assertEvaluationRunAccess(userId, runId, supabase);

    if (run.status === 'cancelled') return run;
    if (run.status === 'completed' || run.status === 'failed') {
      throw new Error(`Evaluation run is already ${run.status}`);
    }

    const [results, examples] = await Promise.all([
      this.getEvaluationResults(runId, supabase),
      this.listDatasetExamples(run.dataset_id, supabase)
    ]);
    const cancelledAt = new Date().toISOString();
    const cancellationReason = reason?.trim() || null;
    const summary = {
      ...buildEvaluationRunSummary(results, examples.length),
      cancellation: {
        cancelled_at: cancelledAt,
        reason: cancellationReason
      }
    };

    const { data: cancelledRun, error: cancelError } = await supabase
      .from('evaluation_runs')
      .update({
        status: 'cancelled',
        summary,
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason
      })
      .eq('id', runId)
      .in('status', ['pending', 'running'])
      .select('*')
      .maybeSingle();

    if (cancelError) throw cancelError;
    if (!cancelledRun) {
      const latest = await this.getEvaluationRun(runId, supabase);
      if (latest.status === 'cancelled') return latest;
      throw new Error(`Evaluation run is already ${latest.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queueClient = supabase as any;
    const { error: queueError } = await queueClient
      .from('evaluation_run_jobs')
      .update({
        status: 'cancelled',
        locked_at: null,
        cancelled_at: cancelledAt,
        error_message: cancellationReason ?? 'Cancelled by user',
        updated_at: cancelledAt
      })
      .eq('evaluation_run_id', runId)
      .in('status', ['pending', 'running']);
    if (queueError) throw queueError;

    return cancelledRun as EvaluationRun;
  },

  /**
   * Execute a persisted evaluation run. Existing result rows are treated as
   * checkpoints so a retried job resumes from the first unfinished example.
   * Cancellation is cooperative: an in-flight provider call may finish, but
   * the worker checks cancellation before and after each example and never
   * persists results after cancellation has won.
   */
  async executeEvaluationRun(runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();

    const run = await this.getEvaluationRun(runId, supabase);
    if (!run) throw new Error('Evaluation run not found');

    const examples = await this.listDatasetExamples(run.dataset_id, supabase);
    const agentVersion = await agents.getVersion(run.agent_version_id, supabase);
    if (!agentVersion) throw new Error('Agent version not found');

    let resultRows = await this.getEvaluationResults(runId, supabase);
    if (run.status === 'cancelled') {
      throw new EvaluationRunCancelledError(runId);
    }
    if (run.status === 'completed') {
      return { run, results: resultRows, summary: run.summary };
    }

    let summary = buildEvaluationRunSummary(resultRows, examples.length);
    const { data: runningRun, error: runningError } = await supabase
      .from('evaluation_runs')
      .update({ status: 'running', summary })
      .eq('id', runId)
      .in('status', ['pending', 'running'])
      .select('id')
      .maybeSingle();
    if (runningError) throw runningError;
    if (!runningRun) {
      await assertEvaluationRunNotCancelled(supabase, runId);
      throw new Error('Evaluation run is not executable');
    }

    const completedExampleIds = new Set(resultRows.map((result) => result.example_id));

    for (const example of examples) {
      if (completedExampleIds.has(example.id)) continue;

      await assertEvaluationRunNotCancelled(supabase, runId);
      const agentResponse = await runAgentForEvaluation(
        agentVersion.agent_id,
        run.agent_version_id,
        example.input,
        supabase
      );
      await assertEvaluationRunNotCancelled(supabase, runId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizedAgentOutput = normalizeTextValue((agentResponse as any)?.text ?? agentResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizedExpected = normalizeTextValue((example.expected_output as any)?.text ?? example.expected_output);
      const exactMatch = normalizedAgentOutput === normalizedExpected;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trace = (agentResponse as any)?.trace ?? {};

      const resultPayload = {
        evaluation_run_id: runId,
        example_id: example.id,
        agent_output: agentResponse,
        exact_match: exactMatch,
        details: {
          normalized_output: normalizedAgentOutput,
          passed: exactMatch,
          score: exactMatch ? 1 : 0,
          trace
        }
      };

      const { data: result, error: resultError } = await supabase
        .from('evaluation_run_results')
        .insert([resultPayload])
        .select('*')
        .single();

      if (resultError || !result) {
        const message = String(resultError?.message ?? resultError ?? '');
        if (message.includes('evaluation_run_cancelled')) {
          throw new EvaluationRunCancelledError(runId);
        }
        throw resultError ?? new Error('Failed to persist evaluation result');
      }

      resultRows = [...resultRows, result as EvaluationRunResult];
      completedExampleIds.add(example.id);
      summary = buildEvaluationRunSummary(resultRows, examples.length);

      const { data: progressRun, error: progressError } = await supabase
        .from('evaluation_runs')
        .update({ summary })
        .eq('id', runId)
        .eq('status', 'running')
        .select('id')
        .maybeSingle();
      if (progressError) throw progressError;
      if (!progressRun) {
        await assertEvaluationRunNotCancelled(supabase, runId);
        throw new Error('Evaluation run left running state during execution');
      }
    }

    summary = buildEvaluationRunSummary(resultRows, examples.length);
    const { data: completedRun, error: updateError } = await supabase
      .from('evaluation_runs')
      .update({ status: 'completed', summary })
      .eq('id', runId)
      .eq('status', 'running')
      .select('*')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!completedRun) {
      await assertEvaluationRunNotCancelled(supabase, runId);
      throw new Error('Failed to complete evaluation run');
    }

    return { run: completedRun as EvaluationRun, results: resultRows, summary };
  },

  async markEvaluationRunFailed(
    runId: string,
    errorMessage: string,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const run = await this.getEvaluationRun(runId, supabase);
    if (run.status === 'cancelled') return;

    const results = await this.getEvaluationResults(runId, supabase);
    const examples = await this.listDatasetExamples(run.dataset_id, supabase);
    const summary = {
      ...buildEvaluationRunSummary(results, examples.length),
      error: errorMessage
    };

    const { error } = await supabase
      .from('evaluation_runs')
      .update({ status: 'failed', summary })
      .eq('id', runId)
      .neq('status', 'cancelled');
    if (error) throw error;
  },

  async getEvaluationRun(runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('evaluation_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) throw error;
    return data as EvaluationRun;
  },

  async getEvaluationResults(runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('evaluation_run_results')
      .select('*')
      .eq('evaluation_run_id', runId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as EvaluationRunResult[];
  },

  async listEvaluationResults(options?: { runIds?: string[] }, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    let query = supabase.from('evaluation_run_results').select('*').order('created_at', { ascending: true });

    if (options?.runIds && options.runIds.length > 0) {
      query = query.in('evaluation_run_id', options.runIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as EvaluationRunResult[];
  }
};

async function runAgentForEvaluation(
  agentId: string,
  agentVersionId: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient<Database>
) {
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) throw new Error('Agent not found for evaluation');

  const { data: agentVersion } = await supabase
    .from('agent_versions')
    .select('*')
    .eq('id', agentVersionId)
    .single();

  if (!agentVersion) throw new Error('Agent version not found for evaluation');

  const message = String(input?.text ?? input);
  const { data: conversation } = await supabase
    .from('conversations')
    .insert([{ agent_id: agentId, user_id: agent.user_id, title: 'Evaluation temporary conversation' }])
    .select('id')
    .single();

  if (!conversation) throw new Error('Failed to create temporary conversation for evaluation');

  // Dynamically import the runtime so the SDK does not statically depend on the
  // runtime project while still executing the pinned agent workflow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtimeModule: any = await (eval('import("@agent-workbench/agent-runtime")'));
  const runMultiAgentWorkflow = runtimeModule.runMultiAgentWorkflow as (
    input: any,
    model?: string
  ) => Promise<{ message: string; trace?: any }>;

  const result = await runMultiAgentWorkflow(
    {
      userId: agent.user_id,
      conversationId: conversation.id,
      message,
      workflow: agentVersion.workflow,
      systemPrompt: agentVersion.system_prompt
    },
    agentVersion.model
  );

  return { text: result.message, trace: result.trace ?? {} };
}
