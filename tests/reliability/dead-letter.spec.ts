import { beforeAll, describe, it, expect } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { enqueueAgentRun, incrementAttemptsAndMaybeDead } from '@agent-workbench/agent-runtime';
import { createTestUserWithAgent } from '../utils/createTestUserWithAgent';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();
let seededUserId: string;
let seededAgentId: string;

beforeAll(async () => {
  const seeded = await createTestUserWithAgent();
  seededUserId = seeded.userId;
  seededAgentId = seeded.agentId;
});

describe('Dead-letter handling', () => {
  it('moves job to failed state after exceeding max attempts', async () => {
    const conversationId = randomUUID();

    await supabase.from('conversations').insert([
      { id: conversationId, agent_id: seededAgentId, user_id: seededUserId, title: 'dead letter test' }
    ]);

    const runId = await enqueueAgentRun({
      runId: '',
      userId: seededUserId,
      conversationId,
      message: 'dead letter',
      workflow: ['Planner'],
      memories: []
    } as any);

    await supabase.from('agent_run_jobs').update({ max_attempts: 1 }).eq('run_id', runId);

    const r = await incrementAttemptsAndMaybeDead(runId, 'failure');
    expect(r.isDead).toBe(true);

    const { data: job } = await supabase.from('agent_run_jobs').select('*').eq('run_id', runId).single();
    expect(job.status).toBe('failed');
  });
});
