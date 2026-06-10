import { afterEach, describe, expect, it } from 'vitest';
import { agentRuns } from '@agent-workbench/sdk';
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

describe('Replay integrity verification', () => {
  it('persists a complete ordered execution trace and returns correct replay data', async () => {
    context = await createTestRun();
    const job = {
      runId: context.runId,
      userId: context.userId,
      conversationId: context.conversationId,
      message: 'Generate a short status update for the test run.',
      workflow: ['Planner', 'Executor', 'Reviewer'],
      memories: []
    } as const;

    await processAgentRunJob(job as any);
    const trace = await waitForStep(context.runId, 'reviewer');

    const run = await agentRuns.replay(context.runId);
    expect(run).toBeDefined();
    expect(run?.status).toBe('completed');
    expect(run?.execution_trace).toBeInstanceOf(Array);

    const steps = run?.execution_trace ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]?.step?.toLowerCase()).toContain('planner');
    expect(steps[1]?.step?.toLowerCase()).toContain('executor');
    expect(steps[2]?.step?.toLowerCase()).toContain('reviewer');
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
    expect(steps[steps.length - 1]?.output).toBeTruthy();

    if (steps.some((step) => step.step === 'tool')) {
      const executorIndex = steps.findIndex((step) => step.step?.toLowerCase() === 'executor');
      const toolIndex = steps.findIndex((step) => step.step === 'tool');
      expect(toolIndex).toBeGreaterThanOrEqual(executorIndex);
    }

    expect(trace.length).toBeGreaterThanOrEqual(3);
  });
});
