import { pathToFileURL } from 'node:url';
import {
  dequeueAgentRunAfter,
  dequeueEvaluationRunAfter,
  reclaimStaleAgentRunJobsAfter,
  reclaimStaleEvaluationRunJobsAfter
} from './cutoverQueue';
import { dequeueAgentRun, reclaimStaleJobs } from './queue';
import { processAgentRunJob } from './worker';
import {
  dequeueEvaluationRun,
  processEvaluationRunJob,
  reclaimStaleEvaluationJobs,
  type EvaluationRunQueueJob
} from './evaluationQueue';
import type { AgentRunQueueJob } from './queue';

const WORKER_CLAIM_NOT_BEFORE_ENV = 'AGENT_WORKBENCH_WORKER_NOT_BEFORE';

export type ProductionWorkerLogRecord = {
  level: 'info' | 'error';
  event: string;
  queue?: 'agent_run_jobs' | 'evaluation_run_jobs';
  run_id?: string;
  queue_job_id?: string;
  duration_ms?: number;
  signal?: string;
  error?: string;
  claim_not_before?: string;
};

export type ProductionWorkerDependencies = {
  dequeueAgentRun: (notBefore?: string) => Promise<AgentRunQueueJob | null>;
  processAgentRunJob: (job: AgentRunQueueJob) => Promise<void>;
  reclaimStaleAgentJobs: (notBefore?: string) => Promise<string[]>;
  dequeueEvaluationRun: (notBefore?: string) => Promise<EvaluationRunQueueJob | null>;
  processEvaluationRunJob: (job: EvaluationRunQueueJob) => Promise<void>;
  reclaimStaleEvaluationJobs: (notBefore?: string) => Promise<string[]>;
  now: () => number;
  log: (record: ProductionWorkerLogRecord) => void;
};

const DEFAULT_IDLE_MS = 1_000;
const DEFAULT_ERROR_BACKOFF_MS = 5_000;

const defaultDependencies: ProductionWorkerDependencies = {
  dequeueAgentRun: (notBefore) => notBefore
    ? dequeueAgentRunAfter(notBefore)
    : dequeueAgentRun(),
  processAgentRunJob,
  reclaimStaleAgentJobs: (notBefore) => notBefore
    ? reclaimStaleAgentRunJobsAfter(notBefore)
    : reclaimStaleJobs(),
  dequeueEvaluationRun: (notBefore) => notBefore
    ? dequeueEvaluationRunAfter(notBefore)
    : dequeueEvaluationRun(),
  processEvaluationRunJob,
  reclaimStaleEvaluationJobs: (notBefore) => notBefore
    ? reclaimStaleEvaluationRunJobsAfter(notBefore)
    : reclaimStaleEvaluationJobs(),
  now: () => Date.now(),
  log(record) {
    const output = JSON.stringify({
      ...record,
      timestamp: new Date().toISOString(),
      service: 'agent-workbench-worker'
    });
    if (record.level === 'error') console.error(output);
    else console.info(output);
  }
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveWorkerClaimNotBefore(
  value = process.env[WORKER_CLAIM_NOT_BEFORE_ENV],
  nodeEnv = process.env.NODE_ENV
): string | undefined {
  const candidate = value?.trim();

  if (!candidate) {
    if (nodeEnv === 'production') {
      throw new Error(`${WORKER_CLAIM_NOT_BEFORE_ENV} is required when NODE_ENV=production`);
    }
    return undefined;
  }

  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(candidate)) {
    throw new Error(`${WORKER_CLAIM_NOT_BEFORE_ENV} must include an explicit UTC offset or Z suffix`);
  }

  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${WORKER_CLAIM_NOT_BEFORE_ENV} must be a valid ISO-8601 timestamp`);
  }

  return new Date(timestamp).toISOString();
}

async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function processAgentLane(
  dependencies: ProductionWorkerDependencies,
  claimNotBefore?: string
): Promise<boolean> {
  const job = await dependencies.dequeueAgentRun(claimNotBefore);
  if (!job) {
    await dependencies.reclaimStaleAgentJobs(claimNotBefore).catch(() => []);
    return false;
  }

  const startedAt = dependencies.now();
  dependencies.log({
    level: 'info',
    event: 'worker_job_claimed',
    queue: 'agent_run_jobs',
    run_id: job.runId
  });

  try {
    await dependencies.processAgentRunJob(job);
    dependencies.log({
      level: 'info',
      event: 'worker_job_finished',
      queue: 'agent_run_jobs',
      run_id: job.runId,
      duration_ms: Math.max(0, dependencies.now() - startedAt)
    });
    return true;
  } catch (error) {
    dependencies.log({
      level: 'error',
      event: 'worker_job_error',
      queue: 'agent_run_jobs',
      run_id: job.runId,
      duration_ms: Math.max(0, dependencies.now() - startedAt),
      error: errorMessage(error)
    });
    throw error;
  }
}

async function processEvaluationLane(
  dependencies: ProductionWorkerDependencies,
  claimNotBefore?: string
): Promise<boolean> {
  const job = await dependencies.dequeueEvaluationRun(claimNotBefore);
  if (!job) {
    await dependencies.reclaimStaleEvaluationJobs(claimNotBefore).catch(() => []);
    return false;
  }

  const startedAt = dependencies.now();
  dependencies.log({
    level: 'info',
    event: 'worker_job_claimed',
    queue: 'evaluation_run_jobs',
    run_id: job.runId,
    queue_job_id: job.id
  });

  try {
    await dependencies.processEvaluationRunJob(job);
    dependencies.log({
      level: 'info',
      event: 'worker_job_finished',
      queue: 'evaluation_run_jobs',
      run_id: job.runId,
      queue_job_id: job.id,
      duration_ms: Math.max(0, dependencies.now() - startedAt)
    });
    return true;
  } catch (error) {
    dependencies.log({
      level: 'error',
      event: 'worker_job_error',
      queue: 'evaluation_run_jobs',
      run_id: job.runId,
      queue_job_id: job.id,
      duration_ms: Math.max(0, dependencies.now() - startedAt),
      error: errorMessage(error)
    });
    throw error;
  }
}

export async function runProductionWorker(options: {
  signal: AbortSignal;
  dependencies?: ProductionWorkerDependencies;
  idleMs?: number;
  errorBackoffMs?: number;
  claimNotBefore?: string;
}): Promise<void> {
  const dependencies = options.dependencies ?? defaultDependencies;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const errorBackoffMs = options.errorBackoffMs ?? DEFAULT_ERROR_BACKOFF_MS;
  let firstLane: 'agent' | 'evaluation' = 'agent';

  dependencies.log({
    level: 'info',
    event: 'worker_started',
    ...(options.claimNotBefore ? { claim_not_before: options.claimNotBefore } : {})
  });

  while (!options.signal.aborted) {
    let processed = false;
    let sawError = false;
    const lanes = firstLane === 'agent'
      ? [processAgentLane, processEvaluationLane]
      : [processEvaluationLane, processAgentLane];

    firstLane = firstLane === 'agent' ? 'evaluation' : 'agent';

    for (const lane of lanes) {
      if (options.signal.aborted) break;
      try {
        processed = (await lane(dependencies, options.claimNotBefore)) || processed;
      } catch {
        sawError = true;
      }
    }

    if (options.signal.aborted) break;
    if (!processed) {
      await sleepWithSignal(sawError ? errorBackoffMs : idleMs, options.signal);
    }
  }

  dependencies.log({ level: 'info', event: 'worker_stopped' });
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const claimNotBefore = resolveWorkerClaimNotBefore();

  const requestStop = (signal: NodeJS.Signals) => {
    defaultDependencies.log({
      level: 'info',
      event: 'worker_stop_requested',
      signal
    });
    controller.abort(signal);
  };

  process.once('SIGTERM', requestStop);
  process.once('SIGINT', requestStop);

  await runProductionWorker({ signal: controller.signal, claimNotBefore });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main().catch((error) => {
    defaultDependencies.log({
      level: 'error',
      event: 'worker_fatal_error',
      error: errorMessage(error)
    });
    process.exitCode = 1;
  });
}
