# Worker Container and Private Coolify Validation

Agent Workbench has a provider-portable production worker container contract. Coolify is currently a **private validation target only**. Final v1.0 production hosting is selected separately after validation. A laptop-hosted Coolify worker does not satisfy the always-on production requirement, and this procedure is not a production cutover.

The worker services the durable `agent_run_jobs` and `evaluation_run_jobs` queues. It needs no Redis, database sidecar, persistent volume, inbound port, public domain, webhook, OAuth callback, browser route, or other inbound route. Its only required connections are outbound HTTPS to an isolated Supabase test backend and, for live-provider tests, the selected model provider.

Do not reuse another application's Supabase deployment, credentials, schemas, volumes, routes, or secrets. Never connect this validation worker to Agent Workbench production or to an unrelated local Supabase stack.

## Runtime and container contract

- Node.js 22 and repository-pinned pnpm 10.34.2 are used with a frozen lockfile.
- `pnpm build:worker` builds SDK/runtime workspaces and prepares explicit ESM artifacts. The final stage keeps the proven pnpm workspace dependency layout, copies only the SDK/runtime workspaces, and starts `node packages/agent-runtime/dist/productionWorker.js`.
- The process runs as non-root `node`, logs to stdout/stderr, exposes no port, and needs no writable application filesystem. `/tmp` is a small in-memory filesystem.
- Compose drops Linux capabilities, prevents privilege escalation, uses an init for PID 1 signal forwarding, sends `SIGTERM`, and allows 300 seconds for shutdown.
- Use exactly one replica initially. `restart: unless-stopped`, 0.50 CPU, 512 MiB RAM, and 256 PIDs are conservative shared-host starting limits.
- No privileged mode, Docker socket, host network/mount, database, Redis, or persistent volume is configured. Standard Node/Debian CA certificates support outbound TLS.

The worker finishes a claimed job before graceful shutdown exits. If forcibly terminated first, persisted queue leases, checkpoints, and cutoff-aware stale reclaim provide recovery. This deployment contract does not change queue semantics.

## Environment variables

| Variable | Classification | Contract |
| --- | --- | --- |
| `NODE_ENV` | Required for startup | Fixed to `production`; activates fail-closed cutoff validation. |
| `AGENT_WORKBENCH_WORKER_NOT_BEFORE` | Required for startup; test-only value; must never use production value | Explicit-offset ISO-8601 test cutoff, stable across validation restarts. |
| `NEXT_PUBLIC_SUPABASE_URL` | Required for startup/queue access; must never use production value | Isolated test Supabase API URL. The historical name is intentionally used server-side too; a future server alias could improve clarity, but a rename is not required. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for startup/queue and execution access; must never use production value | Isolated test service-role key. It bypasses RLS and remains a runtime secret. |
| `OPENAI_API_KEY` | Required for OpenAI execution; must never use production value | Optional at startup; required when a queued run is pinned to OpenAI. |
| `ANTHROPIC_API_KEY` | Required for Anthropic execution; must never use production value | Optional at startup; required when a queued run is pinned to Anthropic. |
| `USE_MOCK_OPENAI` | Optional; test-only | Hermetic tests may set `true`; it is not evidence of live connectivity and must not be used in production. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional for this worker | Browser-only; the worker creates service-role clients. |

Provider credentials fail at execution time for the selected provider; there is no silent cross-provider fallback. Never commit or print secrets. Compose requires cutoff, URL, and service-role variables before rendering; provider variables may be omitted when that provider is not tested.

## Test backend requirement and topology

Use a **dedicated Supabase test project** by default. A Supabase development branch is acceptable only with fully separate service-role credentials and lifecycle controls and no path to production rows. An isolated local stack can be faithful because CI already exercises Supabase CLI, but a second full stack on this constrained shared laptop adds risk; never reuse or modify the unrelated existing stack.

Generic PostgreSQL alone is insufficient. Apply all repository migrations in order. The runtime depends on PostgREST/Supabase RPC calls, service-role authorization/RLS bypass, Auth-linked UUID data, and Supabase schema/function behavior. Realtime is not needed for worker validation. Migrations enable required extensions including `vector` for message embeddings.

Required objects include:

- Tables: `agent_run_jobs`, `agent_runs`, `agent_run_events`, `conversations`, `messages`, `agents`, `agent_versions`, `tools`, `tool_calls`, organization/membership/usage tables, `evaluation_run_jobs`, `evaluation_runs`, `evaluation_run_results`, `evaluation_datasets`, `evaluation_dataset_examples`, and `experiments`.
- Cutoff RPCs: `dequeue_agent_run_job_after`, `reclaim_stale_agent_run_jobs_after`, `dequeue_evaluation_run_job_after`, and `reclaim_stale_evaluation_run_jobs_after`.
- Supporting behavior: `match_messages`, quota reservation/usage functions, queue triggers, cancellation fields/functions, RLS/grants, and evaluation orchestration over evaluation tables.
- Migration floor: the complete ordered set through `20260816065916_queue_claim_cutover_fence.sql`. Queue-only migrations omit required execution, RLS, grants, versioning, tools, cancellation, quota, and evaluation behavior.

Seed minimum test-only Auth user, organization/membership and billing/quota row, agent/version, conversation, agent run/job, evaluation dataset/examples/run/job, and experiment linkage through normal application/SDK enqueue paths. Never copy production rows.

```text
Developer/Admin
  -> Tailscale -> existing Coolify
       -> Agent Workbench / agent-test / worker (one replica, no route)
            -> dedicated TEST Supabase over HTTPS
            -> provider test usage only when explicitly exercised
```

Do not provision the backend or Coolify resource during repository preparation.

## Private validation preparation

Use a separate Coolify project/environment/resource conceptually named `Agent Workbench / agent-test / worker` with `compose.coolify.yaml`. Do not alter Coolify, Traefik, Tailscale, Docker daemon, firewall, host networking, existing Supabase, or unrelated resources. Assign no domain or port. Confirm one replica and the Compose limits/security settings.

Render Compose locally with unmistakable dummy values, but do not start it:

```sh
AGENT_WORKBENCH_WORKER_NOT_BEFORE=2026-08-30T00:00:00Z \
NEXT_PUBLIC_SUPABASE_URL=https://test.invalid \
SUPABASE_SERVICE_ROLE_KEY=test-only-placeholder \
docker compose -f compose.coolify.yaml config
```

The timestamp is only a syntax example.

## Cutoff-fence validation (test data only)

1. Record IDs, statuses, attempts, `locked_at`, and timestamps for pending agent and evaluation jobs created before a planned cutoff.
2. Create and record one stale `running` test lease in each lane before the cutoff.
3. Start one worker with a cutoff after those rows; confirm `worker_started.claim_not_before` and that all pre-cutoff fields remain unchanged.
4. Enqueue a minimal post-cutoff agent run through the test application/SDK; confirm claim log and terminal run/queue state.
5. Enqueue a tiny post-cutoff evaluation; confirm claim log, results, experiment reconciliation, and terminal state.
6. Safely age isolated-test leases. Confirm a post-cutoff stale lease is reclaimed while pre-cutoff stale leases remain unchanged.
7. Restart with the identical cutoff, process one new job, and prove the original pre-cutoff snapshots remain identical.
8. Run `pnpm ops:queue-health` from a trusted test environment with the same test URL, test key, and cutoff. Preserve redacted evidence.

## Shutdown and recovery validation

1. While idle, send `SIGTERM`; require `worker_stop_requested`, then `worker_stopped`, exit, and configured restart behavior. Repeat `SIGINT` locally.
2. During one small claimed job, request a normal stop/redeploy. Verify no new claim after the request, safe terminal/checkpoint state, `worker_stopped`, and exit within 300 seconds.
3. Redeploy only this test resource; verify the replacement preserves the exact cutoff and one-replica count.
4. Force-terminate only the isolated worker after a claim. After its lease expires, verify cutoff-aware reclaim and completion/resumption from persisted state.
5. Inspect provider/tool evidence for duplicate irreversible effects. Use idempotent or read-only tools: lease recovery cannot make arbitrary external side effects transactional.

## Shared-host resource safety

This is functional validation, not capacity testing. Run one small job at a time; no load tests, throughput benchmarks, concurrent builds, or deliberate stress.

Capture `docker stats --no-stream` and host free memory/load/disk before, during, and after steps. Record idle RSS, active peak RAM/CPU, image size, build peak RAM/CPU/duration, disk delta, Supabase request/error and network effects where available, restart count, and OOM/kill events. Build only while the host is otherwise quiet.

Pause if available host memory falls below 1.5 GiB, swap thrashes, sustained load exceeds four logical CPUs, disk free falls below 10 GiB or 15%, the worker restarts unexpectedly, or unrelated services degrade. These are conservative stop conditions, not capacity claims.

## Production cutover remains separate

Private validation proves the container/runtime contract, environment validation, cutoff behavior, both lanes, shutdown/recovery, and single-job resource use. It does not prove always-on availability, production isolation, monitoring, backup/restore, capacity, provider quotas, or operational ownership.

The final production host remains a future decision under issue #33 and the release-cutover runbook. Preserve `render.yaml` as a provider reference/fallback. Production cutover requires separately approved infrastructure, operational evidence, monitoring/alerting, secrets, rollback, disaster-recovery rehearsal, capacity/cost review, and an explicit backlog decision.
