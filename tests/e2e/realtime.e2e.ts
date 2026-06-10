import { afterEach, describe, expect, it } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { cleanupRuns } from '../utils/cleanupRuns';
import { createTestRun } from '../utils/createTestRun';
import { waitForStep } from '../utils/waitForStep';
import { processAgentRunJob } from '@agent-workbench/agent-runtime';

let context: Awaited<ReturnType<typeof createTestRun>> | null = null;

afterEach(async () => {
  if (context) {
    await cleanupRuns(context);
    context = null;
  }
});

describe('Realtime event verification', () => {
  it('emits ordered execution_step events and a single run_completed event', async () => {
    context = await createTestRun();
    const supabase = createServerSupabaseClient();
    const events: Array<{ event: string; payload: any }> = [];

    const channel = supabase.channel(`run:${context.runId}`);
    channel.on('broadcast', { event: 'execution_step' }, (payload) => {
      events.push({ event: 'execution_step', payload });
    });
    channel.on('broadcast', { event: 'run_completed' }, (payload) => {
      events.push({ event: 'run_completed', payload });
    });

    await channel.subscribe();

    const startAt = Date.now();
    const job = {
      runId: context.runId,
      userId: context.userId,
      conversationId: context.conversationId,
      message: 'Produce a brief status summary for realtime verification.',
      workflow: ['Planner', 'Executor', 'Reviewer'],
      memories: []
    } as const;

    await processAgentRunJob(job as any);
    await waitForStep(context.runId, 'reviewer');

    const traceResponse = await supabase
      .from('agent_runs')
      .select('execution_trace')
      .eq('id', context.runId)
      .single();

    const trace = (traceResponse.data?.execution_trace as Array<{ id: string }>) ?? [];
    const stepEventIds = events.filter((event) => event.event === 'execution_step').map((event) => event.payload.id);
    const runCompletedEvents = events.filter((event) => event.event === 'run_completed');

    expect(stepEventIds.length).toBeGreaterThanOrEqual(trace.length);
    expect(new Set(stepEventIds).size).toBe(stepEventIds.length);
    expect(runCompletedEvents.length).toBe(1);
    expect(stepEventIds).toEqual(trace.map((step) => step.id));
    expect(Date.now() - startAt).toBeLessThan(20000);

    await supabase.removeChannel(channel);
  });
});
