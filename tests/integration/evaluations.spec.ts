import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createServerSupabaseClient, evaluations } from '@agent-workbench/sdk';
import { createTestRun } from '../utils/createTestRun';
import { cleanupRuns } from '../utils/cleanupRuns';

let context: Awaited<ReturnType<typeof createTestRun>> | null = null;
let supabase: ReturnType<typeof createServerSupabaseClient>;

beforeEach(async () => {
  supabase = createServerSupabaseClient();
  context = await createTestRun();
});

afterEach(async () => {
  if (context) {
    await cleanupRuns(context);
    await supabase.from('evaluation_run_results').delete().neq('id', '');
    await supabase.from('evaluation_runs').delete().neq('id', '');
    await supabase.from('evaluation_dataset_examples').delete().neq('id', '');
    await supabase.from('evaluation_datasets').delete().neq('id', '');
    context = null;
  }
});

describe('Evaluations integration', () => {
  it('dataset lifecycle: create, add examples, retrieve', async () => {
    const dataset = await evaluations.createDataset(context!.userId, {
      agentId: context!.agentId,
      name: 'test-dataset',
      description: 'a simple dataset'
    }, supabase);

    expect(dataset).toBeDefined();

    const examples = [
      { input: { text: 'input one' }, expectedOutput: { text: 'EXPECTED ONE' } },
      { input: { text: 'input two' }, expectedOutput: { text: 'EXPECTED TWO' } }
    ];

    const inserted = await evaluations.addDatasetExamples(dataset.id, examples, supabase);
    expect(inserted.length).toBe(2);

    const fetched = await evaluations.getDataset(dataset.id, supabase);
    expect(fetched).toBeDefined();
    expect(fetched.name).toBe('test-dataset');
  });

  it('queues an evaluation and executes it from the persisted run checkpoint', async () => {
    vi.doMock('@agent-workbench/agent-runtime', () => ({
      runMultiAgentWorkflow: async () => ({
        message: 'expected one',
        trace: { total_tokens: 10, latency_ms: 25, estimated_cost: 0.001 }
      })
    }));

    const dataset = await evaluations.createDataset(context!.userId, {
      agentId: context!.agentId,
      name: 'eval-dataset',
      description: 'for eval run'
    }, supabase);

    await evaluations.addDatasetExamples(dataset.id, [
      { input: { text: 'irrelevant' }, expectedOutput: { text: 'EXPECTED ONE' } }
    ], supabase);

    const queued = await evaluations.createEvaluationRun(context!.userId, {
      datasetId: dataset.id,
      agentVersionId: context!.versionId
    }, supabase);

    expect(queued.run.status).toBe('pending');
    expect(queued.run.summary).toMatchObject({
      total_examples: 1,
      processed_examples: 0,
      progress: 0
    });

    const executed = await evaluations.executeEvaluationRun(queued.run.id, supabase);
    expect(executed.run.status).toBe('completed');
    expect(executed.results.length).toBe(1);
    expect(executed.summary).toMatchObject({
      total_examples: 1,
      processed_examples: 1,
      remaining_examples: 0,
      exact_match_rate: 1,
      progress: 1
    });

    await supabase.from('agents').update({ system_prompt: 'different prompt' }).eq('id', context!.agentId);

    const queuedAgain = await evaluations.createEvaluationRun(context!.userId, {
      datasetId: dataset.id,
      agentVersionId: context!.versionId
    }, supabase);
    const executedAgain = await evaluations.executeEvaluationRun(queuedAgain.run.id, supabase);

    expect(executedAgain.summary.exact_match_rate).toBe(1);
  });
});
