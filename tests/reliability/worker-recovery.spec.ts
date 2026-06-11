import { describe, it, expect } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { reclaimStaleJobs } from '@agent-workbench/agent-runtime';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();

describe('Worker recovery', () => {
  it('reclaims stale running jobs back to pending', async () => {
    const conversationId = randomUUID();
    const userId = randomUUID();

    await supabase.from('conversations').insert([
      { id: conversationId, agent_id: randomUUID(), user_id: userId, title: 'reclaim test' }
    ]);

    const { data: run } = await supabase.from('agent_runs').insert([
      { user_id: userId, conversation_id: conversationId, workflow: ['Planner'], status: 'pending' }
    ]).select('id').single() as any;

    const runId = run.id as string;

    await supabase.from('agent_run_jobs').insert([
      { run_id: runId, user_id: userId, conversation_id: conversationId, message: 'stale', workflow: ['Planner'], status: 'running', locked_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), attempts: 0 }
    ]);

    const reclaimed = await reclaimStaleJobs('10 minutes');
    expect(Array.isArray(reclaimed)).toBe(true);

    const { data: job } = await supabase.from('agent_run_jobs').select('*').eq('run_id', runId).single();
    expect(job.status).toBe('pending');
  });
});
