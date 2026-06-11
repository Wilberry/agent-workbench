import { afterAll, describe, expect, it } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { enqueueAgentRun, dequeueAgentRun, isProcessing, setProcessing } from '@agent-workbench/agent-runtime';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();
const createdRuns: string[] = [];

describe('Reliability suite - queue and idempotency', () => {
  it('enqueues and dequeues a job reliably', async () => {
    const conversationId = randomUUID();
    const userId = randomUUID();

    const { data: conversation } = await supabase.from('conversations').insert([
      { id: conversationId, agent_id: randomUUID(), user_id: userId, title: 'queue test' }
    ]).select('id').single();

    expect(conversation?.id).toBe(conversationId);

    const runId = await enqueueAgentRun({
      runId: '',
      userId,
      conversationId,
      message: 'Queue reliability test',
      workflow: ['Planner', 'Executor', 'Reviewer'],
      memories: []
    } as any);

    createdRuns.push(runId);
    const job = await dequeueAgentRun();
    expect(job).toBeDefined();
    expect(job?.runId).toBe(runId);
    expect(isProcessing(runId)).toBe(false);

    setProcessing(runId, true);
    expect(isProcessing(runId)).toBe(true);
    setProcessing(runId, false);
    expect(isProcessing(runId)).toBe(false);
  });
});

afterAll(async () => {
  for (const runId of createdRuns) {
    await supabase.from('agent_runs').delete().eq('id', runId);
  }
});
