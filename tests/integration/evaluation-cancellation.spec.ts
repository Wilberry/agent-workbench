import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerSupabaseClient, evaluations, experiments } from '@agent-workbench/sdk';
import { createTestRun } from '../utils/createTestRun';
import { cleanupRuns } from '../utils/cleanupRuns';

let context: Awaited<ReturnType<typeof createTestRun>> | null = null;
let supabase: ReturnType<typeof createServerSupabaseClient>;
let outsiderUserId: string | null = null;

beforeEach(async () => {
  supabase = createServerSupabaseClient();
  context = await createTestRun();

  const { data, error } = await supabase.auth.admin.createUser({
    email: `evaluation-cancel-outsider-${crypto.randomUUID()}@example.com`,
    password: `Cancel-${crypto.randomUUID()}!`,
    email_confirm: true
  });
  if (error || !data.user) throw error ?? new Error('Failed to create outsider user');
  outsiderUserId = data.user.id;
});

afterEach(async () => {
  await (supabase as any).from('evaluation_run_jobs').delete().neq('id', '');
  await supabase.from('experiments').delete().neq('id', '');
  await supabase.from('evaluation_run_results').delete().neq('id', '');
  await supabase.from('evaluation_runs').delete().neq('id', '');
  await supabase.from('evaluation_dataset_examples').delete().neq('id', '');
  await supabase.from('evaluation_datasets').delete().neq('id', '');

  if (context) {
    await cleanupRuns(context);
    context = null;
  }
  if (outsiderUserId) {
    await supabase.auth.admin.deleteUser(outsiderUserId);
    outsiderUserId = null;
  }
});

async function createExperimentFixture() {
  const dataset = await evaluations.createDataset(context!.userId, {
    agentId: context!.agentId,
    name: 'cancellation-dataset'
  }, supabase);
  await evaluations.addDatasetExamples(dataset.id, [
    { input: { text: 'one' }, expectedOutput: { text: 'one' } },
    { input: { text: 'two' }, expectedOutput: { text: 'two' } }
  ], supabase);

  const experiment = await experiments.createExperiment(context!.userId, {
    name: 'cancellation-experiment',
    agentId: context!.agentId,
    versionAId: context!.versionId,
    versionBId: context!.versionId,
    datasetId: dataset.id
  }, supabase);

  return { dataset, experiment };
}

describe('queued evaluation cancellation', () => {
  it('cancels both active experiment arms and their queue jobs', async () => {
    const { experiment } = await createExperimentFixture();
    const started = await experiments.executeExperiment(context!.userId, {
      experimentId: experiment.id
    }, supabase);

    expect(started.experiment.status).toBe('running');
    expect(started.runA.status).toBe('pending');
    expect(started.runB.status).toBe('pending');

    const cancelled = await experiments.cancelExperiment(
      context!.userId,
      experiment.id,
      'test cancellation',
      supabase
    );

    expect(cancelled.experiment.status).toBe('cancelled');
    expect(cancelled.runA?.status).toBe('cancelled');
    expect(cancelled.runB?.status).toBe('cancelled');

    const { data: jobs, error } = await (supabase as any)
      .from('evaluation_run_jobs')
      .select('evaluation_run_id,status,locked_at')
      .in('evaluation_run_id', [started.runA.id, started.runB.id]);
    if (error) throw error;

    expect(jobs).toHaveLength(2);
    expect(jobs.every((job: any) => job.status === 'cancelled')).toBe(true);
    expect(jobs.every((job: any) => job.locked_at === null)).toBe(true);
  });

  it('makes cancellation idempotent', async () => {
    const { experiment } = await createExperimentFixture();
    const started = await experiments.executeExperiment(context!.userId, {
      experimentId: experiment.id
    }, supabase);

    const first = await evaluations.cancelEvaluationRun(
      context!.userId,
      started.runA.id,
      'stop',
      supabase
    );
    const second = await evaluations.cancelEvaluationRun(
      context!.userId,
      started.runA.id,
      'stop again',
      supabase
    );

    expect(first.status).toBe('cancelled');
    expect(second.status).toBe('cancelled');
    expect(second.id).toBe(first.id);
  });

  it('rejects cross-user experiment execution and cancellation', async () => {
    const { experiment } = await createExperimentFixture();

    await expect(
      experiments.executeExperiment(outsiderUserId!, { experimentId: experiment.id }, supabase)
    ).rejects.toThrow('Not authorized to access this experiment');

    await expect(
      experiments.cancelExperiment(outsiderUserId!, experiment.id, null, supabase)
    ).rejects.toThrow('Not authorized to access this experiment');
  });
});
