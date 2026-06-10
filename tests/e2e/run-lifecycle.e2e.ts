import { afterEach, describe, expect, it } from 'vitest';
import { agentRuns } from '@agent-workbench/sdk';
import { cleanupRuns } from '../utils/cleanupRuns';
import { createTestRun } from '../utils/createTestRun';
import { processAgentRunJob } from '@agent-workbench/agent-runtime';

let context: Awaited<ReturnType<typeof createTestRun>> | null = null;

afterEach(async () => {
  if (context) {
    await cleanupRuns(context);
    context = null;
  }
});

describe('Run lifecycle and SDK contract', () => {
  it('completes the run and returns stable SDK replay data', async () => {
    context = await createTestRun();

    const job = {
      runId: context.runId,
      userId: context.userId,
      conversationId: context.conversationId,
      message: 'Verify run lifecycle and SDK return values.',
      workflow: ['Planner', 'Executor', 'Reviewer'],
      memories: []
    } as const;

    await processAgentRunJob(job as any);

    const run = await agentRuns.get(context.runId);
    expect(run).toBeDefined();
    expect(run?.status).toBe('completed');

    const replay = await agentRuns.replay(context.runId);
    expect(replay).toBeDefined();
    expect(replay?.id).toBe(context.runId);
    expect(replay?.execution_trace).toBeInstanceOf(Array);
  });
});
