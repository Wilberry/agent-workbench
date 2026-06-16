import { beforeAll, describe, expect, it } from 'vitest';
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

describe('Retries behavior', () => {
  it('increments attempts and moves to failed when max reached', async () => {
    const conversationId = randomUUID();

    await supabase.from('conversations').insert([
      { id: conversationId, agent_id: seededAgentId, user_id: seededUserId, title: 'retries test' }
    ]);

    const runId = await enqueueAgentRun({
      runId: '',
      userId: seededUserId,
      conversationId,
      message: 'retries test',
      workflow: ['Planner'],
      memories: []
    } as any);

    // Set max_attempts to 2 for test
    await supabase.from('agent_run_jobs').update({ max_attempts: 2 }).eq('run_id', runId);

    const first = await incrementAttemptsAndMaybeDead(runId, 'first failure');
    expect(first.isDead).toBe(false);

    const second = await incrementAttemptsAndMaybeDead(runId, 'second failure');
    expect(second.isDead).toBe(true);

    const { data: job } = await supabase.from('agent_run_jobs').select('*').eq('run_id', runId).single();
    expect(job.status).toBe('failed');
  });
});
