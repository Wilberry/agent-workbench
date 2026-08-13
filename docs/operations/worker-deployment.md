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
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

`NODE_ENV=production` is defined directly in the Blueprint.

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

Job events include the queue name and persisted run ID. Evaluation events also include the queue-job ID. User messages, memory payloads, API keys, and queue payloads are not included in supervisor logs.

## First-deploy verification

After the service reaches a running state:

1. Confirm the worker log contains `worker_started`.
2. Confirm queue health no longer reports `pending_without_running_jobs` after a production-safe job is enqueued.
3. Enqueue one production-safe agent run and verify a matching `worker_job_claimed` event appears.
4. Verify the run reaches a terminal state without manual queue mutation.
5. Repeat with one small evaluation run so the evaluation lane is exercised.
6. Run `pnpm ops:queue-health` from a trusted operator environment once the queue-observability slice is merged.
7. Verify a normal redeploy emits `worker_stop_requested` and `worker_stopped` before the replacement worker begins claiming new jobs.

## Existing backlog

Do not treat deployment of the worker as authorization to purge or blindly execute historical backlog. The production queue currently contains old pending rows from earlier development activity. Before enabling sustained consumption, decide whether those rows represent disposable test data or jobs that must still execute.

If the backlog is not intended for execution, handle cleanup under an explicit data-retention decision rather than deleting rows as part of worker deployment.

## Scaling

Start with one worker instance. The queue claim functions already use durable database ownership semantics, so horizontal scaling can be evaluated later if throughput requires it. Do not add Redis solely for scaling this v1.0 deployment; the Postgres queue is the current system of record.
