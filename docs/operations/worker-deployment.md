# Production Worker Deployment

Agent Workbench uses durable Postgres queues for agent runs and evaluation runs. Experiments enqueue two evaluation runs, so the production worker services two queue lanes:

- `agent_run_jobs`
- `evaluation_run_jobs`

The worker runtime is provider-portable. The primary v1.0 deployment target is Coolify using the repository-owned `Dockerfile.worker` and `compose.coolify.yaml`. The existing `render.yaml` remains a reference deployment contract until the Coolify production cutover is proven.

## Runtime contract

- Node.js: 22.x
- Process: `packages/agent-runtime/dist/productionWorker.js`
- Container replicas for initial cutover: 1
- Graceful shutdown allowance: 300 seconds
- Queue storage: existing Supabase Postgres tables
- Redis: not required
- Public HTTP port/domain: not required

The worker alternates which queue lane is checked first so one queue cannot permanently starve the other. A claimed job is completed before a graceful shutdown exits. If the container host terminates the process before a long-running claim finishes, the existing queue lease/checkpoint/reclaim behavior remains the recovery mechanism.

Production startup is fail-closed: `AGENT_WORKBENCH_WORKER_NOT_BEFORE` must contain an ISO-8601 timestamp with an explicit UTC offset or `Z` suffix. The worker uses service-role-only cutoff-aware Postgres RPCs for both claiming and stale-lease reclaim. Jobs created before the configured timestamp are therefore outside the worker's eligible claim set and are not mutated by normal worker operation.

## Container build contract

`Dockerfile.worker` builds the repository with Node 22 and the pinned pnpm version from `packageManager`:

```text
pnpm install --frozen-lockfile
pnpm build:worker
```

The runtime image starts the generated Node entrypoint directly:

```text
node packages/agent-runtime/dist/productionWorker.js
```

`pnpm build:worker` builds the SDK and runtime workspaces, normalizes generated relative ESM specifiers to explicit `.js` paths, and marks the generated `dist` directories as ESM. The runtime therefore does not need a TypeScript loader.

The container runs as the non-root `node` user. The Coolify Compose contract also enables an init process, sends `SIGTERM`, allows 300 seconds for graceful shutdown, and uses Docker's `unless-stopped` restart policy.

## Coolify deployment

Create a Git-based Docker Compose application from this repository and use:

```text
Branch: main
Base directory: /
Docker Compose location: /compose.coolify.yaml
```

The worker is an internal background process. Do not configure a public domain or expose a port for it.

Coolify should build the image from `Dockerfile.worker` through `compose.coolify.yaml`. Keep the Compose file in Git as the source of truth rather than editing a divergent deployment definition in the dashboard.

## Required environment variables

Configure these as runtime secrets/variables in Coolify:

```text
AGENT_WORKBENCH_WORKER_NOT_BEFORE
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

`NODE_ENV=production` is fixed in the Compose definition.

Do not deploy the worker with a placeholder cutover value. For the first production cutover, set `AGENT_WORKBENCH_WORKER_NOT_BEFORE` to the deliberate UTC cutover instant immediately before enabling the worker, for example:

```text
2026-08-30T06:00:00Z
```

The value above is only an example. Use the actual cutover timestamp. Keep the chosen value stable across ordinary redeploys so jobs that were validly enqueued after cutover remain eligible for retry/reclaim.

Do not commit secret values to the repository, Compose file, GitHub comments, logs, or documentation.

Provider keys are required so queued runs pinned to either configured live provider can execute. A missing provider credential must remain a runtime configuration failure rather than silently falling back to another provider.

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

Coolify container logs are sufficient for the first v1.0 cutover evidence. Longer-term centralized log shipping can be evaluated after v1.0 without changing worker semantics.

## First-deploy verification

Before starting the production worker:

1. Record the current historical queue counts and oldest/newest pending timestamps.
2. Choose and record the exact UTC cutover instant.
3. Set `AGENT_WORKBENCH_WORKER_NOT_BEFORE` to that instant in Coolify.
4. Verify there are no intentionally valid pending jobs between the timestamp and worker enablement unless they should be consumed.
5. Confirm exactly one worker replica will start.

After the container reaches a running state:

1. Confirm the log contains `worker_started` with the expected `claim_not_before` value.
2. Confirm historical pre-cutover queue counts are unchanged.
3. Enqueue one production-safe agent run and verify a matching `worker_job_claimed` event appears.
4. Verify the run reaches a terminal state without manual queue mutation.
5. Repeat with one small evaluation run so the evaluation lane is exercised.
6. Run `pnpm ops:queue-health` from a trusted operator environment.
7. Redeploy the Coolify application once and verify `worker_stop_requested` and `worker_stopped` appear before the replacement worker begins normal processing.
8. Re-check the historical pre-cutover rows and confirm they remain untouched.
9. Attach the resulting timestamps, log excerpts, run IDs, and queue-health output to GitHub issue #33.

## Existing backlog

Do not treat deployment of the worker as authorization to purge or blindly execute historical backlog. The production queue contains old pending rows from earlier development activity. Those rows remain part of the system of record until a separate retention decision is made.

The production cutover fence intentionally leaves historical rows in place. Do not move the cutoff backwards merely to make queue-health counts look cleaner. If the backlog is later classified as disposable test data, handle cleanup under an explicit data-retention decision with its own audit trail.

## Scaling

Start with one worker instance. The cutoff-aware queue claim functions preserve `FOR UPDATE SKIP LOCKED` semantics, so horizontal scaling can be evaluated later if throughput requires it. Do not add Redis solely for scaling the v1.0 deployment; the Postgres queue remains the system of record.

## Render reference

`render.yaml` remains checked in as a secondary/reference process-host contract during the Coolify transition. Do not operate both Render and Coolify workers against production during the initial cutover. Once Coolify is proven and issue #33 is closed, the Render reference can be retained for portability or removed in a separate cleanup change.
