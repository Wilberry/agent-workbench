# Production Worker Deployment

Agent Workbench uses durable Postgres queues for agent runs and evaluation runs. Experiments enqueue two evaluation runs, so the production worker only needs two queue lanes:

- `agent_run_jobs`
- `evaluation_run_jobs`

The Render Blueprint in `render.yaml` defines one always-on background worker that services both lanes.

## Runtime contract

- Node.js: 22.x
- Region: Frankfurt
- Render service type: background worker
- Instance count: 1
- Graceful shutdown allowance: 300 seconds
- Queue storage: existing Supabase Postgres tables
- Redis / Render Key Value: not required

The worker alternates which queue lane is checked first so one queue cannot permanently starve the other. A claimed job is completed before a graceful shutdown exits. If Render terminates the process before a long-running claim finishes, the existing queue lease/checkpoint/reclaim behavior remains the recovery mechanism.

Production startup is fail-closed: `AGENT_WORKBENCH_WORKER_NOT_BEFORE` must contain an ISO-8601 timestamp with an explicit UTC offset or `Z` suffix. The worker uses service-role-only cutoff-aware Postgres RPCs for both claiming and stale-lease reclaim. Jobs created before the configured timestamp are therefore outside the worker's eligible claim set and are not mutated by normal worker operation.

## Build contract

Render runs:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm build:worker
```

`pnpm build:worker` builds the SDK and runtime workspaces, then normalizes generated relative ESM specifiers to explicit `.js` paths and marks the generated `dist` directories as ESM. This keeps the production worker on plain Node instead of requiring a TypeScript runtime loader.

Render starts:

```bash
pnpm start:worker
```

## Required environment variables

Configure these as Render secrets during the initial Blueprint creation flow:

```text
AGENT_WORKBENCH_WORKER_NOT_BEFORE
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

`NODE_ENV=production` is defined directly in the Blueprint.

For the first production cutover, set `AGENT_WORKBENCH_WORKER_NOT_BEFORE` immediately before enabling the worker, for example:

```text
2026-08-16T07:00:00Z
```

Use the actual cutover timestamp for the deployment rather than copying the example. Keep the value stable across ordinary redeploys so jobs that were validly enqueued after cutover remain eligible for retry/reclaim.

Do not commit secret values to `render.yaml`, GitHub, logs, or documentation.

Provider keys are required so queued runs that are pinned to either configured live provider can execute. A missing provider credential should remain a runtime configuration failure, not silently fall back to another provider.

## Structured worker logs

The production supervisor writes JSON log records containing operational identifiers only. Important events include:

```text
worker_started
worker_job_claimed
worker_job_finished
worker_job_error
worker_stop_requested
worker_stopped
worker_fatal_error
```

`worker_started` includes `claim_not_before` when the production cutover fence is active. Job events include the queue name and persisted run ID. Evaluation events also include the queue-job ID. User messages, memory payloads, API keys, and queue payloads are not included in supervisor logs.

## First-deploy verification

Before creating the Render service:

1. Record the current historical queue counts and oldest/newest pending timestamps.
2. Set `AGENT_WORKBENCH_WORKER_NOT_BEFORE` to the intended cutover instant.
3. Verify there are no intentionally valid pending jobs between that timestamp and worker enablement unless you want them consumed.

After the service reaches a running state:

1. Confirm the worker log contains `worker_started` with the expected `claim_not_before` value.
2. Confirm the historical pre-cutover queue counts are unchanged.
3. Enqueue one production-safe agent run and verify a matching `worker_job_claimed` event appears.
4. Verify the run reaches a terminal state without manual queue mutation.
5. Repeat with one small evaluation run so the evaluation lane is exercised.
6. Run `pnpm ops:queue-health` from a trusted operator environment.
7. Verify a normal redeploy emits `worker_stop_requested` and `worker_stopped` before the replacement worker begins claiming new jobs.
8. Re-check the historical pre-cutover rows and confirm they remain untouched.

## Existing backlog

Do not treat deployment of the worker as authorization to purge or blindly execute historical backlog. The production queue contains old pending rows from earlier development activity. Those rows remain part of the system of record until a separate retention decision is made.

The production cutover fence intentionally leaves historical rows in place. Do not move the cutoff backwards merely to make queue-health counts look cleaner. If the backlog is later classified as disposable test data, handle cleanup under an explicit data-retention decision with its own audit trail.

## Scaling

Start with one worker instance. The cutoff-aware queue claim functions preserve `FOR UPDATE SKIP LOCKED` semantics, so horizontal scaling can be evaluated later if throughput requires it. Do not add Redis solely for scaling this v1.0 deployment; the Postgres queue is the current system of record.
