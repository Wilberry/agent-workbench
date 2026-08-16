import { describe, expect, it } from 'vitest';
import {
  collectQueueHealth,
  evaluateQueueSnapshot,
  resolveQueueHealthScope,
  resolveQueueHealthThresholds
} from '../../scripts/ops/queue-health.mjs';

function makeClient(fixtures: Record<string, any>) {
  return {
    from(table: string) {
      return {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          const state: Record<string, any> = { table, columns, options, filters: [] };
          const builder: any = {
            eq(column: string, value: unknown) {
              state.filters.push(['eq', column, value]);
              return builder;
            },
            gte(column: string, value: unknown) {
              state.filters.push(['gte', column, value]);
              return builder;
            },
            lt(column: string, value: unknown) {
              state.filters.push(['lt', column, value]);
              return builder;
            },
            order(column: string, options: unknown) {
              state.order = [column, options];
              return builder;
            },
            limit(value: number) {
              state.limit = value;
              return builder;
            },
            async maybeSingle() {
              const status = state.filters.find((entry: any[]) => entry[1] === 'status')?.[2];
              const source = state.filters.some((entry: any[]) => entry[0] === 'lt' && entry[1] === 'created_at')
                ? fixtures[table]?.preCutover
                : fixtures[table];
              return { data: source?.oldest?.[status] ?? null, error: null };
            },
            then(resolve: (value: unknown) => void) {
              const status = state.filters.find((entry: any[]) => entry[1] === 'status')?.[2];
              const source = state.filters.some((entry: any[]) => entry[0] === 'lt' && entry[1] === 'created_at')
                ? fixtures[table]?.preCutover
                : fixtures[table];
              if (options?.head) {
                resolve({ count: source?.counts?.[status] ?? 0, error: null });
                return;
              }
              if (columns === 'locked_at') {
                resolve({ data: source?.leases ?? [], error: null });
                return;
              }
              if (columns === 'attempts,max_attempts') {
                resolve({ data: source?.failures ?? [], error: null });
                return;
              }
              resolve({ data: [], error: null });
            }
          };
          return builder;
        }
      };
    }
  };
}

describe('queue health', () => {
  it('uses production-safe default thresholds and accepts overrides', () => {
    expect(resolveQueueHealthThresholds({} as NodeJS.ProcessEnv)).toEqual({
      maxPendingAgeMs: 15 * 60 * 1000,
      maxStaleLeaseAgeMs: 5 * 60 * 1000,
      maxFailedJobs: 0
    });

    expect(resolveQueueHealthThresholds({
      QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS: '60',
      QUEUE_HEALTH_MAX_STALE_LEASE_SECONDS: '30',
      QUEUE_HEALTH_MAX_FAILED_JOBS: '2'
    } as NodeJS.ProcessEnv)).toEqual({
      maxPendingAgeMs: 60_000,
      maxStaleLeaseAgeMs: 30_000,
      maxFailedJobs: 2
    });
  });

  it('uses the worker cutover timestamp as the production health boundary', () => {
    expect(resolveQueueHealthScope({} as NodeJS.ProcessEnv)).toEqual({ notBefore: null });
    expect(resolveQueueHealthScope({
      AGENT_WORKBENCH_WORKER_NOT_BEFORE: '2026-08-16T07:10:00Z'
    } as NodeJS.ProcessEnv)).toEqual({
      notBefore: '2026-08-16T07:10:00.000Z'
    });
    expect(() => resolveQueueHealthScope({
      AGENT_WORKBENCH_WORKER_NOT_BEFORE: 'not-a-timestamp'
    } as NodeJS.ProcessEnv)).toThrow('AGENT_WORKBENCH_WORKER_NOT_BEFORE must be a valid ISO-8601 timestamp');
  });

  it('marks old pending work with no running consumer as degraded', () => {
    const result = evaluateQueueSnapshot({
      queue: 'agent_runs',
      table: 'agent_run_jobs',
      counts: { pending: 4, running: 0, failed: 0 },
      oldest_pending_at: '2026-08-11T00:00:00.000Z',
      oldest_pending_age_ms: 60 * 60 * 1000,
      stale_running: 0,
      exhausted_failed: 0
    });

    expect(result.status).toBe('degraded');
    expect(result.reasons).toEqual([
      'pending_age_exceeded',
      'pending_without_running_jobs'
    ]);
  });

  it('marks stale leases and failed jobs as degraded', () => {
    const result = evaluateQueueSnapshot({
      queue: 'agent_runs',
      table: 'agent_run_jobs',
      counts: { pending: 0, running: 1, failed: 2 },
      oldest_pending_at: null,
      oldest_pending_age_ms: null,
      stale_running: 1,
      exhausted_failed: 2
    });

    expect(result.status).toBe('degraded');
    expect(result.reasons).toEqual([
      'stale_running_jobs',
      'failed_jobs_exceeded'
    ]);
  });

  it('collects aggregate health for agent and evaluation queues', async () => {
    const nowMs = Date.parse('2026-08-12T00:00:00.000Z');
    const client = makeClient({
      agent_run_jobs: {
        counts: { pending: 1, running: 0, completed: 1, failed: 0, cancelled: 0 },
        oldest: { pending: { created_at: '2026-08-11T23:00:00.000Z' } },
        leases: [],
        failures: []
      },
      evaluation_run_jobs: {
        counts: { pending: 0, running: 0, completed: 2, failed: 0, cancelled: 0 },
        oldest: { pending: null },
        leases: [],
        failures: []
      }
    });

    const health = await collectQueueHealth({
      client: client as any,
      nowMs,
      thresholds: {
        maxPendingAgeMs: 15 * 60 * 1000,
        maxStaleLeaseAgeMs: 5 * 60 * 1000,
        maxFailedJobs: 0
      }
    });

    expect(health.status).toBe('degraded');
    expect(health.scope).toEqual({ mode: 'all_rows', not_before: null });
    expect(health.queues).toHaveLength(2);
    expect(health.queues[0]).toMatchObject({
      queue: 'agent_runs',
      status: 'degraded',
      reasons: ['pending_age_exceeded', 'pending_without_running_jobs']
    });
    expect(health.queues[1]).toMatchObject({
      queue: 'evaluation_runs',
      status: 'ok',
      reasons: []
    });
  });

  it('quarantines pre-cutover backlog without hiding it from the report', async () => {
    const notBefore = '2026-08-16T07:10:00.000Z';
    const client = makeClient({
      agent_run_jobs: {
        counts: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
        oldest: { pending: null },
        leases: [],
        failures: [],
        preCutover: {
          counts: { pending: 118, running: 0, completed: 5, failed: 18, cancelled: 0 }
        }
      },
      evaluation_run_jobs: {
        counts: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
        oldest: { pending: null },
        leases: [],
        failures: [],
        preCutover: {
          counts: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 }
        }
      }
    });

    const health = await collectQueueHealth({
      client: client as any,
      nowMs: Date.parse('2026-08-16T08:00:00.000Z'),
      notBefore,
      thresholds: {
        maxPendingAgeMs: 15 * 60 * 1000,
        maxStaleLeaseAgeMs: 5 * 60 * 1000,
        maxFailedJobs: 0
      }
    });

    expect(health.status).toBe('ok');
    expect(health.scope).toEqual({ mode: 'post_cutover', not_before: notBefore });
    expect(health.queues[0]).toMatchObject({
      status: 'ok',
      counts: { pending: 0, running: 0, failed: 0 },
      quarantined_pre_cutover: {
        not_before: notBefore,
        total: 141,
        counts: { pending: 118, running: 0, completed: 5, failed: 18, cancelled: 0 }
      }
    });
    expect(health.queues[0].reasons).toEqual([]);
  });
});
