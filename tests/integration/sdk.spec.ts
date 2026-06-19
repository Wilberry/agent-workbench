import { describe, expect, it, beforeEach } from 'vitest';
import { agentRuns, createServerSupabaseClient } from '@agent-workbench/sdk';
import { createTestRun } from '../utils/createTestRun';
import { cleanupRuns } from '../utils/cleanupRuns';
import { processAgentRunJob } from '@agent-workbench/agent-runtime';

let context: Awaited<ReturnType<typeof createTestRun>> | null = null;

describe('SDK integration', () => {
  beforeEach(async () => {
    context = await createTestRun();
  });

  afterEach(async () => {
    if (context) {
      await cleanupRuns(context);
      context = null;
    }
  });

  it('enqueues and retrieves an agent run through SDK', async () => {
    const run = await agentRuns.get(context!.runId);
    expect(run).toBeDefined();
    expect(run?.id).toBe(context!.runId);
  });

  it('replays a completed run through SDK', async () => {
    const job = {
      runId: context!.runId,
      userId: context!.userId,
      conversationId: context!.conversationId,
      message: 'Verify SDK replay functionality.',
      workflow: ['Planner', 'Executor', 'Reviewer'],
      memories: []
    } as const;

    await processAgentRunJob(job as any);
    const replay = await agentRuns.replay(context!.runId);
    expect(replay).toBeDefined();
    expect(replay?.status).toBe('completed');
    expect(replay?.execution_trace).toBeInstanceOf(Array);
  });

  it('aggregates telemetry for organization runs', async () => {
    const supabase = createServerSupabaseClient();
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: 'Telemetry Org', slug: `telemetry-org-${Date.now()}`, owner_id: context!.userId }])
      .select('id')
      .single();

    expect(orgError).toBeNull();
    expect(org).toBeDefined();

    const runsPayload = [
      {
        user_id: context!.userId,
        conversation_id: context!.conversationId,
        workflow: ['Planner'],
        status: 'completed',
        organization_id: org.id,
        estimated_cost: 0.12,
        latency_ms: 200,
        total_tokens: 120
      },
      {
        user_id: context!.userId,
        conversation_id: context!.conversationId,
        workflow: ['Executor'],
        status: 'completed',
        organization_id: org.id,
        estimated_cost: 0.08,
        latency_ms: 100,
        total_tokens: 80
      }
    ];

    const { error: runsError } = await supabase.from('agent_runs').insert(runsPayload);
    expect(runsError).toBeNull();

    const telemetry = await agentRuns.orgTelemetry(org.id);

    expect(telemetry.total_runs).toBe(2);
    expect(telemetry.total_tokens).toBe(200);
    expect(telemetry.total_estimated_cost).toBeCloseTo(0.2, 5);
    expect(telemetry.average_latency_ms).toBe(150);

    await supabase.from('agent_runs').delete().eq('organization_id', org.id);
    await supabase.from('organizations').delete().eq('id', org.id);
  });
});
