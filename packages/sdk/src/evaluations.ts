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

function normalizeEvaluationRunSummary(results: Array<{ exact_match: boolean }>) {
  const total = results.length;
  const passed = results.filter((result) => result.exact_match).length;
  return {
    total_examples: total,
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
      // If it's the common `{ text: '...' }` shape, prefer that
      // otherwise stringify as a fallback.
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
    userId: string,
    options?: { organizationId?: string | null },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const query = supabase
      .from('evaluation_datasets')
      .select('*')
      .or(`user_id.eq.${userId}${options?.organizationId ? `,organization_id.eq.${options.organizationId}` : ''}`)
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as EvaluationDataset[];
  },

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

    const { data: examples, error: examplesError } = await supabase
      .from('evaluation_dataset_examples')
      .select('*')
      .eq('dataset_id', payload.datasetId)
      .order('example_index', { ascending: true });

    if (examplesError) throw examplesError;
    const exampleRows = (examples ?? []) as EvaluationDatasetExample[];

    const { data: run, error: runError } = await supabase
      .from('evaluation_runs')
      .insert([
        {
          dataset_id: payload.datasetId,
          agent_version_id: payload.agentVersionId,
          user_id: userId,
          organization_id: payload.organizationId ?? null,
          status: 'running',
          summary: {}
        }
      ])
      .select('*')
      .single();

    if (runError || !run) throw runError ?? new Error('Failed to create evaluation run');
    const runId = run.id as string;

    const resultRows: EvaluationRunResult[] = [];

    for (const example of exampleRows) {
      const agentResponse = await runAgentForEvaluation(
        agentVersion.agent_id,
        payload.agentVersionId,
        example.input,
        supabase
      );

      const normalizedAgentOutput = normalizeTextValue((agentResponse as any)?.text ?? agentResponse);
      const normalizedExpected = normalizeTextValue((example.expected_output as any)?.text ?? example.expected_output);
      const exactMatch = normalizedAgentOutput === normalizedExpected;

      const resultPayload = {
        evaluation_run_id: runId,
        example_id: example.id,
        agent_output: agentResponse,
        exact_match: exactMatch,
        details: {
          normalized_output: normalizedAgentOutput,
          passed: exactMatch,
          score: exactMatch ? 1 : 0
        }
      };

      const { data: result, error: resultError } = await supabase
        .from('evaluation_run_results')
        .insert([resultPayload])
        .select('*')
        .single();

      if (resultError || !result) throw resultError ?? new Error('Failed to persist evaluation result');
      resultRows.push(result as EvaluationRunResult);
    }

    const summary = normalizeEvaluationRunSummary(resultRows);
    const { error: updateError } = await supabase
      .from('evaluation_runs')
      .update({ status: 'completed', summary })
      .eq('id', runId);

    if (updateError) throw updateError;

    return { run: run as EvaluationRun, results: resultRows, summary };
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
  }
};

function normalizeOutput(output: Record<string, unknown>) {
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

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

  if (!agent) {
    throw new Error('Agent not found for evaluation');
  }

  const { data: agentVersion } = await supabase
    .from('agent_versions')
    .select('*')
    .eq('id', agentVersionId)
    .single();

  if (!agentVersion) {
    throw new Error('Agent version not found for evaluation');
  }

  const message = String(input?.text ?? input);
  const { data: conversation } = await supabase
    .from('conversations')
    .insert([{ agent_id: agentId, user_id: agent.user_id, title: 'Evaluation temporary conversation' }])
    .select('id')
    .single();

  if (!conversation) {
    throw new Error('Failed to create temporary conversation for evaluation');
  }

  // Dynamically import the runtime at runtime. Use `eval('import(...)')` so
  // TypeScript does not statically analyze and include the runtime project
  // into the SDK build (this keeps package boundaries clean).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtimeModule: any = await (eval('import("@agent-workbench/agent-runtime")'));
  const runMultiAgentWorkflow = runtimeModule.runMultiAgentWorkflow as (
    input: any,
    model?: string
  ) => Promise<{ message: string }>;

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

  return { text: result.message };
}
