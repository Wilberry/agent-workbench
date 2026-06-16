import { describe, expect, it, beforeEach } from 'vitest';
import { agentRuns } from '@agent-workbench/sdk';
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
});
