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

Optional thresholds:

```text
QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS   default: 900
QUEUE_HEALTH_MAX_STALE_LEASE_SECONDS  default: 300
QUEUE_HEALTH_MAX_FAILED_JOBS           default: 0
```

Exit codes:

- `0` — all queues are within thresholds
- `1` — one or more queues are degraded
- `2` — configuration or query failure prevented the health check

## Signals

Each queue reports:

- counts for `pending`, `running`, `completed`, `failed`, and `cancelled`
- timestamp and age of the oldest pending job
- count of running jobs whose lease exceeds the stale-lease threshold
- count of failed jobs whose attempts reached or exceeded `max_attempts`
- a health status and machine-readable reasons

Possible degradation reasons:

- `pending_age_exceeded` — oldest pending job is older than the configured threshold
- `stale_running_jobs` — one or more running jobs have an old lease
- `failed_jobs_exceeded` — terminal failed-job count exceeds the configured allowance
- `pending_without_running_jobs` — work is queued but no job is currently running

The last signal is intentionally conservative. A polling worker can briefly have pending work and zero running jobs between claims, so alerting should normally require the condition to persist across multiple checks.

## Suggested alert policy

For production, evaluate queue health every 5 minutes and alert when one of these conditions persists for at least two consecutive checks:

- oldest pending age > 15 minutes
- stale running jobs > 0
- failed jobs > 0
- pending jobs > 0 while running jobs remain 0

Page immediately when stale leases continue to increase or newly enqueued work is not claimed. Failed-job alerts can be routed at lower urgency when the failed jobs are known historical records and the current queue is draining normally.

## Investigation order

1. Confirm an always-on worker process is deployed and healthy.
2. Check worker logs for startup/configuration errors.
3. Verify the worker is using the same production Supabase project as the web application.
4. Confirm required provider credentials exist for the work being processed.
5. Inspect queue counts and oldest-pending age with `pnpm ops:queue-health`.
6. Check stale leases before restarting workers. The queue can reclaim expired leases, but repeated stale leases usually indicate process crashes, hard timeouts, or shutdown problems.
7. Inspect terminal failures and retry counts before deciding whether any job should be replayed.

Do not bulk-delete or reset queue rows as a first response. Historical backlog may include user work, test artifacts, or records required for incident reconstruction.

## Worker deployment requirement

A durable queue is not an execution system by itself. Production requires an always-on worker process that continuously calls the repository worker entrypoint, stops accepting new work on `SIGTERM`, allows safe in-flight work to finish or checkpoint, closes resources, and exits cleanly.

Worker hosting is tracked separately because it is live infrastructure work. See issue #33.

## Current production audit note

During the v1.0 audit on 2026-08-12, the production project had an old `agent_run_jobs` backlog with zero active running jobs, and no Agent Workbench worker service was present in the connected Render workspace. No queue rows were changed during that audit. The finding is tracked in issue #33 and should be re-evaluated after a production worker is deployed.
