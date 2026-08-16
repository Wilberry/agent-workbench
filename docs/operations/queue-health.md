# Queue Health Runbook

This runbook covers the durable Postgres-backed queues used by Agent Workbench:

- `public.agent_run_jobs`
- `public.evaluation_run_jobs`

The queue implementation already supports claiming, retries, stale-job reclaim, cancellation, and terminal failure. This runbook focuses on operator-visible health, not queue mutation.

## Run the health check

Use the production Supabase URL and service-role credential in a trusted server or operator shell:

```bash
pnpm ops:queue-health
```

The command emits aggregate JSON only. It does not return job payloads, user identifiers, messages, or stored error text, and it does not update queue rows.

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

For production after the v1.0 worker cutover, also provide the exact same cutoff timestamp configured on the worker:

```text
AGENT_WORKBENCH_WORKER_NOT_BEFORE
```

When this value is set, health evaluation covers only queue rows created at or after the cutoff. Earlier rows remain visible under `quarantined_pre_cutover`, but they do not trigger current-production alerts. This keeps queue monitoring aligned with the worker's actual claim boundary without deleting or rewriting historical records.

If the cutoff variable is omitted, the command intentionally evaluates all queue rows for backwards compatibility and incident investigation. An invalid cutoff timestamp is a configuration error and exits with code `2`.

Optional thresholds:

```text
QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS   default: 900
QUEUE_HEALTH_MAX_STALE_LEASE_SECONDS  default: 300
QUEUE_HEALTH_MAX_FAILED_JOBS           default: 0
```

Exit codes:

- `0` — all in-scope queues are within thresholds
- `1` — one or more in-scope queues are degraded
- `2` — configuration or query failure prevented the health check

## Signals

Each queue reports:

- active counts for `pending`, `running`, `completed`, `failed`, and `cancelled`
- timestamp and age of the oldest active pending job
- count of active running jobs whose lease exceeds the stale-lease threshold
- count of active failed jobs whose attempts reached or exceeded `max_attempts`
- a health status and machine-readable reasons
- when a cutoff is configured, aggregate `quarantined_pre_cutover` counts for historical rows

The top-level `scope` field reports whether the snapshot is evaluating `all_rows` or `post_cutover` work and includes the normalized cutoff timestamp.

Possible degradation reasons:

- `pending_age_exceeded` — oldest active pending job is older than the configured threshold
- `stale_running_jobs` — one or more active running jobs have an old lease
- `failed_jobs_exceeded` — active terminal failed-job count exceeds the configured allowance
- `pending_without_running_jobs` — active work is queued but no active job is currently running

The last signal is intentionally conservative. A polling worker can briefly have pending work and zero running jobs between claims, so alerting should normally require the condition to persist across multiple checks.

## Suggested alert policy

For production, evaluate queue health every 5 minutes and alert when one of these conditions persists for at least two consecutive checks:

- oldest active pending age > 15 minutes
- active stale running jobs > 0
- active failed jobs > 0
- active pending jobs > 0 while active running jobs remain 0

Page immediately when stale leases continue to increase or newly enqueued post-cutover work is not claimed. Pre-cutover quarantined counts are audit/retention signals, not worker-health alerts.

## Historical backlog policy

Do not infer that pre-cutover rows are disposable simply because the worker will not execute them automatically.

During the August 16, 2026 production audit, the 118 pending pre-cutover agent jobs mapped to 45 users and 46 conversations, and every parent `agent_run` remained `pending`. That provenance is not sufficient to classify the backlog as test-only data. The current policy is therefore:

1. preserve the rows unchanged;
2. exclude them from automatic worker claims through `AGENT_WORKBENCH_WORKER_NOT_BEFORE`;
3. exclude them from active production-health degradation while still reporting aggregate counts;
4. make any later cancellation, replay, archival, or deletion a separate explicit retention decision.

This is a quarantine boundary, not a data-deletion policy.

## Investigation order

1. Confirm an always-on worker process is deployed and healthy.
2. Check worker logs for startup/configuration errors.
3. Verify the worker and queue-health command use the same production Supabase project and the same `AGENT_WORKBENCH_WORKER_NOT_BEFORE` value.
4. Confirm required provider credentials exist for the work being processed.
5. Inspect active queue counts and oldest-pending age with `pnpm ops:queue-health`.
6. Check stale leases before restarting workers. The queue can reclaim expired leases, but repeated stale leases usually indicate process crashes, hard timeouts, or shutdown problems.
7. Inspect terminal failures and retry counts before deciding whether any job should be replayed.
8. Review `quarantined_pre_cutover` separately when making retention decisions.

Do not bulk-delete or reset queue rows as a first response. Historical backlog may include user work, test artifacts, or records required for incident reconstruction.

## Worker deployment requirement

A durable queue is not an execution system by itself. Production requires an always-on worker process that continuously calls the repository worker entrypoint, stops accepting new work on `SIGTERM`, allows safe in-flight work to finish or checkpoint, closes resources, and exits cleanly.

Worker hosting remains tracked separately in issue #33. The Render paid-resource requirement is currently deferred; the worker and queue-health cutover contracts can remain ready in the repository until hosting is enabled.

## Current production audit note

The production project currently retains the historical agent-run backlog unchanged. The v1.0 worker cutover fence prevents a future worker from claiming those rows, and cutover-scoped health reporting prevents them from permanently degrading current-production monitoring. No historical queue rows are changed by either mechanism.
