import { describe, expect, it } from 'vitest';
import {
  runProductionWorker,
  type ProductionWorkerDependencies,
  type ProductionWorkerLogRecord
} from '../../packages/agent-runtime/src/productionWorker';

function createDependencies(overrides: Partial<ProductionWorkerDependencies> = {}) {
  const logs: ProductionWorkerLogRecord[] = [];
  let now = 1_000;

  const dependencies: ProductionWorkerDependencies = {
    dequeueAgentRun: async () => null,
    processAgentRunJob: async () => {},
    reclaimStaleAgentJobs: async () => [],
    dequeueEvaluationRun: async () => null,
    processEvaluationRunJob: async () => {},
    reclaimStaleEvaluationJobs: async () => [],
    now: () => {
      now += 25;
      return now;
    },
    log: (record) => logs.push(record),
    ...overrides
  };

  return { dependencies, logs };
}

describe('production worker supervisor', () => {
  it('processes agent and evaluation jobs in the same worker cycle', async () => {
    const controller = new AbortController();
    let agentProcessed = 0;
    let evaluationProcessed = 0;

    const { dependencies, logs } = createDependencies({
      dequeueAgentRun: async () => ({
        runId: 'agent-run-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        message: 'hello',
        workflow: ['executor'],
        memories: []
      }),
      processAgentRunJob: async () => {
        agentProcessed += 1;
      },
      dequeueEvaluationRun: async () => ({
        id: 'evaluation-job-1',
        runId: 'evaluation-run-1',
        userId: 'user-1',
        attempts: 0,
        maxAttempts: 5
      }),
      processEvaluationRunJob: async () => {
        evaluationProcessed += 1;
        controller.abort('test_complete');
      }
    });

    await runProductionWorker({
      signal: controller.signal,
      dependencies,
      idleMs: 0,
      errorBackoffMs: 0
    });

    expect(agentProcessed).toBe(1);
    expect(evaluationProcessed).toBe(1);
    expect(logs.some((record) => record.event === 'worker_started')).toBe(true);
    expect(logs.some((record) => record.event === 'worker_stopped')).toBe(true);
    expect(logs.filter((record) => record.event === 'worker_job_claimed')).toHaveLength(2);
  });

  it('does not claim new work when shutdown is already requested', async () => {
    const controller = new AbortController();
    controller.abort('SIGTERM');
    let dequeues = 0;

    const { dependencies, logs } = createDependencies({
      dequeueAgentRun: async () => {
        dequeues += 1;
        return null;
      },
      dequeueEvaluationRun: async () => {
        dequeues += 1;
        return null;
      }
    });

    await runProductionWorker({ signal: controller.signal, dependencies });

    expect(dequeues).toBe(0);
    expect(logs.map((record) => record.event)).toEqual(['worker_started', 'worker_stopped']);
  });

  it('keeps the other queue lane alive when one lane throws', async () => {
    const controller = new AbortController();
    let evaluationProcessed = 0;

    const { dependencies, logs } = createDependencies({
      dequeueAgentRun: async () => ({
        runId: 'agent-run-failure',
        userId: 'user-1',
        conversationId: 'conversation-1',
        message: 'hello',
        workflow: ['executor'],
        memories: []
      }),
      processAgentRunJob: async () => {
        throw new Error('agent lane failed');
      },
      dequeueEvaluationRun: async () => ({
        id: 'evaluation-job-2',
        runId: 'evaluation-run-2',
        userId: 'user-1',
        attempts: 0,
        maxAttempts: 5
      }),
      processEvaluationRunJob: async () => {
        evaluationProcessed += 1;
        controller.abort('test_complete');
      }
    });

    await runProductionWorker({
      signal: controller.signal,
      dependencies,
      idleMs: 0,
      errorBackoffMs: 0
    });

    expect(evaluationProcessed).toBe(1);
    expect(logs).toContainEqual(expect.objectContaining({
      event: 'worker_job_error',
      queue: 'agent_run_jobs',
      run_id: 'agent-run-failure'
    }));
  });

  it('reclaims stale leases when both queues are idle', async () => {
    const controller = new AbortController();
    let agentReclaims = 0;
    let evaluationReclaims = 0;

    const { dependencies } = createDependencies({
      reclaimStaleAgentJobs: async () => {
        agentReclaims += 1;
        return [];
      },
      reclaimStaleEvaluationJobs: async () => {
        evaluationReclaims += 1;
        controller.abort('test_complete');
        return [];
      }
    });

    await runProductionWorker({
      signal: controller.signal,
      dependencies,
      idleMs: 0,
      errorBackoffMs: 0
    });

    expect(agentReclaims).toBe(1);
    expect(evaluationReclaims).toBe(1);
  });
});
