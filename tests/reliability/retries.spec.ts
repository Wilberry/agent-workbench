import { expect, it, describe } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { enqueueAgentRun, incrementAttemptsAndMaybeDead } from '@agent-workbench/agent-runtime';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();

describe('Retries behavior', () => {
  it('increments attempts and moves to failed when max reached', async () => {
    const conversationId = randomUUID();
    const userId = randomUUID();

    await supabase.from('conversations').insert([
      { id: conversationId, agent_id: randomUUID(), user_id: userId, title: 'retries test' }
    ]);

    const runId = await enqueueAgentRun({
      runId: '',
      userId,
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
