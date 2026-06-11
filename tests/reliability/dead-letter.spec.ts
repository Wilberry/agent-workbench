import { describe, it, expect } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { enqueueAgentRun, incrementAttemptsAndMaybeDead } from '@agent-workbench/agent-runtime';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();

describe('Dead-letter handling', () => {
  it('moves job to failed state after exceeding max attempts', async () => {
    const conversationId = randomUUID();
    const userId = randomUUID();

    await supabase.from('conversations').insert([
      { id: conversationId, agent_id: randomUUID(), user_id: userId, title: 'dead letter test' }
    ]);

    const runId = await enqueueAgentRun({
      runId: '',
      userId,
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
