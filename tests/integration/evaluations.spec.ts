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
    // delete created datasets and related rows
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

  it('evaluation run executes examples and computes exact_match summary (version pinning)', async () => {
    // Mock the runtime to return deterministic outputs matching expected_output (but with different casing)
    vi.doMock('@agent-workbench/agent-runtime', () => ({
      runMultiAgentWorkflow: async () => ({ message: 'expected one' })
    }));

    // create dataset
    const dataset = await evaluations.createDataset(context!.userId, {
      agentId: context!.agentId,
      name: 'eval-dataset',
      description: 'for eval run'
    }, supabase);

    const examples = [
      { input: { text: 'irrelevant' }, expectedOutput: { text: 'EXPECTED ONE' } }
    ];
    await evaluations.addDatasetExamples(dataset.id, examples, supabase);

    // Run evaluation pinned to version created by createTestRun
    const res = await evaluations.createEvaluationRun(context!.userId, {
      datasetId: dataset.id,
      agentVersionId: context!.versionId
    }, supabase);

    expect(res).toBeDefined();
    expect(res.results.length).toBe(1);
    // summary should show exact_match_rate = 1.0 after normalization (case-insensitive)
    expect(res.summary.exact_match_rate).toBe(1);

    // Now change agent settings (system_prompt) and re-run with same pinned version to verify pinning
    await supabase.from('agents').update({ system_prompt: 'different prompt' }).eq('id', context!.agentId);

    const res2 = await evaluations.createEvaluationRun(context!.userId, {
      datasetId: dataset.id,
      agentVersionId: context!.versionId
    }, supabase);

    expect(res2.summary.exact_match_rate).toBe(1);
  });
});
