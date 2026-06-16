import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { enqueueAgentRun, dequeueAgentRun, isProcessing, setProcessing } from '@agent-workbench/agent-runtime';
import { createTestUserWithAgent } from '../utils/createTestUserWithAgent';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();
const createdRuns: string[] = [];
let seededUserId: string;
let seededAgentId: string;

beforeAll(async () => {
  const seeded = await createTestUserWithAgent();
  seededUserId = seeded.userId;
  seededAgentId = seeded.agentId;
});

beforeEach(async () => {
  await supabase.from('agent_run_jobs').delete().eq('status', 'pending').eq('user_id', seededUserId);
});

describe('Reliability suite - queue and idempotency', () => {
  it('enqueues and dequeues a job reliably', async () => {
    const conversationId = randomUUID();

    const { data: conversation } = await supabase.from('conversations').insert([
      { id: conversationId, agent_id: seededAgentId, user_id: seededUserId, title: 'queue test' }
    ]).select('id').single();

    expect(conversation?.id).toBe(conversationId);

    const runId = await enqueueAgentRun({
      runId: '',
      userId: seededUserId,
      conversationId,
      message: 'Queue reliability test',
      workflow: ['Planner', 'Executor', 'Reviewer'],
      memories: []
    } as any);

    createdRuns.push(runId);
    const job = await dequeueAgentRun(seededUserId);
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
