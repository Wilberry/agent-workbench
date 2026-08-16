#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const QUEUES = [
  { name: 'agent_runs', table: 'agent_run_jobs' },
  { name: 'evaluation_runs', table: 'evaluation_run_jobs' }
];

const DEFAULT_THRESHOLDS = Object.freeze({
  maxPendingAgeMs: 15 * 60 * 1000,
  maxStaleLeaseAgeMs: 5 * 60 * 1000,
  maxFailedJobs: 0
});

const QUEUE_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'];

function requiredEnvironment(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseOptionalTimestamp(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Date.parse(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid ISO-8601 timestamp`);
  }
  return new Date(parsed).toISOString();
}

export function resolveQueueHealthThresholds(env = process.env) {
  return {
    maxPendingAgeMs: parsePositiveInteger(
      env.QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS,
      DEFAULT_THRESHOLDS.maxPendingAgeMs / 1000,
      'QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS'
    ) * 1000,
    maxStaleLeaseAgeMs: parsePositiveInteger(
      env.QUEUE_HEALTH_MAX_STALE_LEASE_SECONDS,
      DEFAULT_THRESHOLDS.maxStaleLeaseAgeMs / 1000,
      'QUEUE_HEALTH_MAX_STALE_LEASE_SECONDS'
    ) * 1000,
    maxFailedJobs: parsePositiveInteger(
      env.QUEUE_HEALTH_MAX_FAILED_JOBS,
      DEFAULT_THRESHOLDS.maxFailedJobs,
      'QUEUE_HEALTH_MAX_FAILED_JOBS'
    )
  };
}

export function resolveQueueHealthScope(env = process.env) {
  return {
    notBefore: parseOptionalTimestamp(
      env.AGENT_WORKBENCH_WORKER_NOT_BEFORE,
      'AGENT_WORKBENCH_WORKER_NOT_BEFORE'
    )
  };
}

function ageMs(timestamp, nowMs) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
}

function applyCreatedAtScope(query, notBefore, mode = 'active') {
  if (!notBefore) return query;
  return mode === 'pre_cutover'
    ? query.lt('created_at', notBefore)
    : query.gte('created_at', notBefore);
}

async function countStatus(client, table, status, notBefore = null, mode = 'active') {
  let query = client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('status', status);
  query = applyCreatedAtScope(query, notBefore, mode);
  const { count, error } = await query;
  if (error) throw new Error(`${table}:${status} count failed`);
  return Number(count ?? 0);
}

async function oldestPending(client, table, notBefore = null) {
  let query = client
    .from(table)
    .select('created_at')
    .eq('status', 'pending');
  query = applyCreatedAtScope(query, notBefore);
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`${table}:oldest pending query failed`);
  return data?.created_at ?? null;
}

async function runningLeases(client, table, notBefore = null) {
  let query = client
    .from(table)
    .select('locked_at')
    .eq('status', 'running');
  query = applyCreatedAtScope(query, notBefore);
  const { data, error } = await query;
  if (error) throw new Error(`${table}:running lease query failed`);
  return Array.isArray(data) ? data : [];
}

async function failedAttempts(client, table, notBefore = null) {
  let query = client
    .from(table)
    .select('attempts,max_attempts')
    .eq('status', 'failed');
  query = applyCreatedAtScope(query, notBefore);
  const { data, error } = await query;
  if (error) throw new Error(`${table}:failed attempts query failed`);
  return Array.isArray(data) ? data : [];
}

async function preCutoverCounts(client, table, notBefore) {
  if (!notBefore) return null;
  const counts = {};
  for (const status of QUEUE_STATUSES) {
    counts[status] = await countStatus(client, table, status, notBefore, 'pre_cutover');
  }
  return counts;
}

export async function readQueueSnapshot(client, queue, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const staleLeaseMs = options.staleLeaseMs ?? DEFAULT_THRESHOLDS.maxStaleLeaseAgeMs;
  const notBefore = options.notBefore ?? null;
  const counts = {};

  for (const status of QUEUE_STATUSES) {
    counts[status] = await countStatus(client, queue.table, status, notBefore);
  }

  const [oldestPendingAt, leases, failures, quarantinedCounts] = await Promise.all([
    oldestPending(client, queue.table, notBefore),
    runningLeases(client, queue.table, notBefore),
    failedAttempts(client, queue.table, notBefore),
    preCutoverCounts(client, queue.table, notBefore)
  ]);

  const staleRunning = leases.filter((row) => {
    const leaseAge = ageMs(row.locked_at, nowMs);
    return leaseAge !== null && leaseAge > staleLeaseMs;
  }).length;

  const exhausted = failures.filter((row) =>
    Number(row.attempts ?? 0) >= Number(row.max_attempts ?? 0)
  ).length;

  const quarantinedTotal = quarantinedCounts
    ? Object.values(quarantinedCounts).reduce((sum, value) => sum + Number(value ?? 0), 0)
    : 0;

  return {
    queue: queue.name,
    table: queue.table,
    counts,
    oldest_pending_at: oldestPendingAt,
    oldest_pending_age_ms: ageMs(oldestPendingAt, nowMs),
    stale_running: staleRunning,
    exhausted_failed: exhausted,
    quarantined_pre_cutover: notBefore
      ? {
          not_before: notBefore,
          total: quarantinedTotal,
          counts: quarantinedCounts
        }
      : null
  };
}

export function evaluateQueueSnapshot(snapshot, thresholds = DEFAULT_THRESHOLDS) {
  const reasons = [];
  const pending = Number(snapshot.counts?.pending ?? 0);
  const running = Number(snapshot.counts?.running ?? 0);
  const failed = Number(snapshot.counts?.failed ?? 0);

  if (
    pending > 0 &&
    snapshot.oldest_pending_age_ms !== null &&
    snapshot.oldest_pending_age_ms > thresholds.maxPendingAgeMs
  ) {
    reasons.push('pending_age_exceeded');
  }
  if (snapshot.stale_running > 0) reasons.push('stale_running_jobs');
  if (failed > thresholds.maxFailedJobs) reasons.push('failed_jobs_exceeded');
  if (pending > 0 && running === 0) reasons.push('pending_without_running_jobs');

  return {
    ...snapshot,
    status: reasons.length === 0 ? 'ok' : 'degraded',
    reasons
  };
}

export async function collectQueueHealth({
  client,
  nowMs = Date.now(),
  thresholds = DEFAULT_THRESHOLDS,
  notBefore = null
}) {
  const queues = [];
  for (const queue of QUEUES) {
    const snapshot = await readQueueSnapshot(client, queue, {
      nowMs,
      staleLeaseMs: thresholds.maxStaleLeaseAgeMs,
      notBefore
    });
    queues.push(evaluateQueueSnapshot(snapshot, thresholds));
  }

  return {
    status: queues.every((queue) => queue.status === 'ok') ? 'ok' : 'degraded',
    checked_at: new Date(nowMs).toISOString(),
    scope: {
      mode: notBefore ? 'post_cutover' : 'all_rows',
      not_before: notBefore
    },
    thresholds: {
      max_pending_age_seconds: thresholds.maxPendingAgeMs / 1000,
      max_stale_lease_seconds: thresholds.maxStaleLeaseAgeMs / 1000,
      max_failed_jobs: thresholds.maxFailedJobs
    },
    queues
  };
}

async function main() {
  const url = requiredEnvironment(process.env, 'NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment(process.env, 'SUPABASE_SERVICE_ROLE_KEY');
  const thresholds = resolveQueueHealthThresholds(process.env);
  const { notBefore } = resolveQueueHealthScope(process.env);
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const health = await collectQueueHealth({ client, thresholds, notBefore });
  process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
  if (health.status !== 'ok') process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Queue health check failed: ${message}\n`);
    process.exitCode = 2;
  });
}
