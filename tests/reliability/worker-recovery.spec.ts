import { beforeAll, describe, it, expect } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { reclaimStaleJobs } from '@agent-workbench/agent-runtime';
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

describe('Worker recovery', () => {
  it('reclaims stale running jobs back to pending', async () => {
    const conversationId = randomUUID();

    await supabase.from('conversations').insert([
      { id: conversationId, agent_id: seededAgentId, user_id: seededUserId, title: 'reclaim test' }
    ]);

    const { data: run } = await supabase.from('agent_runs').insert([
      { user_id: seededUserId, conversation_id: conversationId, workflow: ['Planner'], status: 'pending' }
    ]).select('id').single() as any;

    const runId = run.id as string;

    await supabase.from('agent_run_jobs').insert([
      { run_id: runId, user_id: seededUserId, conversation_id: conversationId, message: 'stale', workflow: ['Planner'], status: 'running', locked_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), attempts: 0 }
    ]);

    const reclaimed = await reclaimStaleJobs('10 minutes');
    expect(Array.isArray(reclaimed)).toBe(true);

    const { data: job } = await supabase.from('agent_run_jobs').select('*').eq('run_id', runId).single();
    expect(job.status).toBe('pending');
  });
});
