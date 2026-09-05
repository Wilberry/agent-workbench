# Worker Deployment: Coolify Validation and Production Cutover

Agent Workbench uses one provider-portable worker container for the durable `agent_run_jobs` and `evaluation_run_jobs` queues.

The hosting decision for v1.0 is:

- **Current laptop Coolify:** private validation and pre-production proving ground only.
- **Production:** Coolify on a dedicated always-on VPS.
- **Fallback/reference:** keep `render.yaml` as a provider-portable reference, but Render is not the selected v1.0 worker host.

The laptop must never receive Agent Workbench production Supabase credentials or production provider credentials. A laptop-hosted worker does not satisfy the always-on production requirement because the machine can sleep, reboot, lose power/network, or compete with unrelated services.

The worker needs no Redis, database sidecar, persistent volume, inbound port, public domain, webhook, OAuth callback, browser route, or other inbound route. Its required runtime connections are outbound HTTPS to the selected Supabase project and, for live execution, the configured model provider.

## Runtime and container contract

- Node.js 22 and repository-pinned pnpm 10.34.2 with a frozen lockfile.
- `pnpm build:worker` builds SDK/runtime workspaces and prepares explicit ESM artifacts.
- The final image copies only the required SDK/runtime workspace artifacts and starts `node packages/agent-runtime/dist/productionWorker.js`.
- The process runs as non-root `node`, writes logs to stdout/stderr, exposes no port, and needs no writable application filesystem.
- `/tmp` is a small tmpfs.
- Compose drops Linux capabilities, prevents privilege escalation, uses an init for PID 1 signal forwarding, sends `SIGTERM`, and allows 300 seconds for graceful shutdown.
- Start with one replica. The proven worker limits are 0.50 CPU, 512 MiB RAM, and 256 PIDs.
- No privileged mode, Docker socket, host network/mount, Redis, database sidecar, or persistent volume is configured.

A claimed job is allowed to finish during graceful shutdown. If the process is forcibly terminated before completion, persisted queue leases, checkpoints, and cutoff-aware stale reclaim provide recovery. This deployment contract does not change queue semantics.

## Environment contract

| Variable | Private validation | Production |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` |
| `AGENT_WORKBENCH_WORKER_NOT_BEFORE` | Stable test-only cutoff | Exact UTC production cutover instant chosen immediately before first enablement |
| `NEXT_PUBLIC_SUPABASE_URL` | Dedicated hosted test Supabase URL | Agent Workbench production Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Dedicated test service-role/secret key | Dedicated production service-role/secret key |
| `USE_MOCK_OPENAI` | `true` for deterministic mock validation | unset or `false` |
| `OPENAI_API_KEY` | unset unless explicitly testing live OpenAI | production secret if OpenAI-backed runs are supported |
| `ANTHROPIC_API_KEY` | unset unless explicitly testing live Anthropic | production secret if Anthropic-backed runs are supported |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | not required by the worker | not required by the worker |

Provider credentials fail at execution time for the selected provider; there is no silent cross-provider fallback.

Never commit, print, paste into tickets, or capture production secret values in screenshots. If a production secret is exposed, rotate it before enabling the worker.

### Cutoff invariant

`AGENT_WORKBENCH_WORKER_NOT_BEFORE` is a safety boundary, not a convenience setting.

- The worker uses cutoff-aware dequeue and stale-reclaim RPCs for both queue lanes.
- Rows created before the cutoff are quarantined from normal worker claims and reclaim.
- After the production worker has been enabled, **never move the production cutoff backward**. Doing so could expose historical backlog that was intentionally fenced off.
- Ordinary redeploys and rollbacks keep the exact same production cutoff.
- A later cutoff may be used only as part of an explicit new cutover decision with operator review.

## Private validation topology

Use the existing shared laptop Coolify only with the dedicated hosted Supabase test project.

```text
Developer/Admin
  -> Tailscale -> existing laptop Coolify
       -> Agent Workbench / agent-test / worker
            -> dedicated TEST Supabase over HTTPS
            -> mock provider by default
```

Do not reuse or modify the unrelated local self-hosted Supabase stack, TaskPro resources, Docker daemon settings, firewall, Tailscale configuration, global Traefik configuration, or unrelated Coolify resources.

Use one replica, no public domain, and no exposed port.

### Private validation preparation

Render Compose with unmistakable dummy values before first setup:

```sh
AGENT_WORKBENCH_WORKER_NOT_BEFORE=2026-08-30T00:00:00Z \
NEXT_PUBLIC_SUPABASE_URL=https://test.invalid \
SUPABASE_SERVICE_ROLE_KEY=test-only-placeholder \
docker compose -f compose.coolify.yaml config
```

For deterministic private validation, render/deploy with `USE_MOCK_OPENAI=true` and leave live provider keys unset. When `USE_MOCK_OPENAI` is omitted it must resolve to `false`.

The example cutoff above is syntax only and must never be copied into production.

## Test backend requirements

Use a dedicated Supabase test project. Generic PostgreSQL alone is insufficient because the worker depends on Supabase/PostgREST behavior, service-role access, RLS/grants, RPCs, and the repository schema.

Apply the complete ordered migration set required by the current repository. Worker-critical objects include:

- `agent_run_jobs`, `agent_runs`, `agent_run_events`, `conversations`, `messages`, `agents`, `agent_versions`, `tools`, and `tool_calls`;
- organization/membership/usage tables;
- `evaluation_run_jobs`, `evaluation_runs`, `evaluation_run_results`, `evaluation_datasets`, `evaluation_dataset_examples`, and `experiments`;
- cutoff RPCs `dequeue_agent_run_job_after`, `reclaim_stale_agent_run_jobs_after`, `dequeue_evaluation_run_job_after`, and `reclaim_stale_evaluation_run_jobs_after`;
- quota, cancellation, versioning, RLS/grant, embedding/matching, and evaluation orchestration behavior.

Seed only test fixtures. Never copy production rows into the test project.

## Proven private validation gates

Before considering the container contract ready for production, preserve evidence for these gates on the isolated test backend:

1. Worker starts with the expected cutoff and one replica.
2. Pre-cutoff pending and stale-running sentinel rows remain unchanged.
3. One post-cutoff agent run completes end to end.
4. One post-cutoff evaluation completes end to end.
5. Runtime traces/telemetry identify the expected provider/model and persist token/cost/latency fields.
6. Idle `SIGTERM` produces `worker_stop_requested`, `worker_stopped`, then a clean `worker_started` after restart.
7. Restart preserves the same cutoff and image contract.
8. `pnpm ops:queue-health` detects a known failure under default thresholds and returns healthy only when an explicit test-only exception threshold is supplied.
9. No worker fatal errors, unexpected restart loop, or OOM kill occurs.

## Shared-host safety for laptop validation

Laptop validation is functional testing, not capacity testing.

- Run one small job at a time.
- Do not run load tests, throughput benchmarks, deliberate stress, or overlapping heavy builds.
- Preserve unrelated workloads.
- Capture `docker stats --no-stream`, host free memory/load/disk, restart count, and OOM state around significant validation steps.

Pause if available host memory falls below 1.5 GiB, swap thrashes, sustained load exceeds the four-logical-CPU host envelope, disk free falls below 10 GiB or 15%, the worker restarts unexpectedly, or unrelated services degrade.

These are conservative laptop stop conditions, not production capacity claims.

# Production Coolify on a dedicated VPS

## VPS prerequisites

Provision a dedicated or strongly isolated always-on Linux VPS for Agent Workbench production Coolify.

Recommended starting host envelope:

- at least 2 vCPU;
- at least 2 GiB RAM;
- sufficient disk headroom for Coolify, Docker images/build cache, logs, and OS updates;
- stable public internet connectivity and automatic restart after host reboot;
- SSH/admin access restricted to the operator;
- current OS security updates;
- time synchronization enabled.

The worker itself remains limited to the proven 0.50 CPU / 512 MiB starting envelope unless production measurements justify a change.

Do not colocate unrelated databases or business-critical applications on the initial worker VPS. The worker is stateless, so no application persistent volume is required.

## Production Coolify resource

Create a dedicated Agent Workbench project/environment/application in the production Coolify instance.

Required source/runtime settings:

- repository: `Wilberry/agent-workbench`;
- branch: `main`;
- Compose file: `/compose.coolify.yaml`;
- one replica;
- no domain;
- no exposed port;
- no host network;
- no Docker socket or host mounts;
- `Git Commit SHA = HEAD` for normal branch-following deployments, while the deployment log must still be checked for the exact resolved SHA before acceptance.

For the first production cutover, record the exact reviewed `main` SHA and require the Coolify deployment log to resolve to that same SHA before canary execution.

## Production preflight

Do not create or enable the production worker until all items below are complete:

1. Confirm the production Supabase project is healthy.
2. Confirm the complete migration chain required by the worker is applied, including the cutoff-aware claim/reclaim migration.
3. Take a fresh read-only production queue snapshot for both `agent_run_jobs` and `evaluation_run_jobs`.
4. Record pending/running/completed/failed counts, oldest pending timestamps, stale leases, and exhausted failures.
5. Make an explicit decision to leave historical backlog quarantined. Do not delete, reset, rewrite, or replay it as part of worker deployment.
6. Confirm no other production worker is consuming these queues.
7. Confirm one production Coolify replica will be created and no public route will be assigned.
8. Load production Supabase and provider credentials only into the dedicated production Coolify resource.
9. Set `USE_MOCK_OPENAI=false` or leave it unset.
10. Choose the exact UTC `AGENT_WORKBENCH_WORKER_NOT_BEFORE` immediately before first worker enablement and record it in the cutover evidence.
11. Confirm the cutoff is later than all historical rows intended to remain quarantined.
12. Confirm the reviewed `main` SHA to deploy.

## First production deployment

1. Deploy the dedicated production Coolify application from `main`.
2. Verify the deployment log resolves to the reviewed SHA.
3. Verify exactly one worker container is running.
4. Verify `status=running`, no OOM kill, and no restart loop.
5. Verify `worker_started.claim_not_before` exactly matches the approved production cutoff.
6. Verify `USE_MOCK_OPENAI` is not enabled.
7. Verify there are no `worker_fatal_error` events.
8. Re-run a read-only production queue snapshot and prove pre-cutoff historical rows have not changed.

Do not proceed to canaries if any of these checks fail.

## Production canary sequence

Use supported application/SDK enqueue paths. Do not insert raw queue rows manually unless a separately reviewed incident procedure requires it.

1. Enqueue exactly one small production-safe agent run after the cutoff.
2. Verify matching `worker_job_claimed` and `worker_job_finished` events.
3. Verify run and queue state become terminal `completed` without manual mutation.
4. Verify provider/model and telemetry are persisted as expected.
5. Confirm the historical pre-cutoff queue snapshot is unchanged.
6. Enqueue exactly one small evaluation run after the cutoff.
7. Verify one persisted evaluation result and completed queue/run state.
8. Confirm the historical pre-cutoff queue snapshot is still unchanged.
9. Do not automatically retry a failed canary; preserve the failed rows and diagnose first.

## Queue health and alert thresholds

`pnpm ops:queue-health` is the canonical operator snapshot.

Default production thresholds are intentionally strict:

- maximum pending age: 900 seconds;
- maximum stale lease age: 300 seconds;
- maximum failed jobs: 0.

Alert/investigate when any of these occur:

- queue health exits non-zero;
- pending age exceeds 15 minutes;
- any stale-running lease is detected;
- any failed job appears;
- pending jobs exist while running jobs are zero;
- the worker process is absent;
- unexpected container restart count increases;
- OOM kill occurs;
- repeated `worker_job_error` or any `worker_fatal_error` appears;
- host disk, memory, or CPU headroom becomes unsafe.

A non-zero production failure threshold must never be configured as a permanent way to hide new failures. If a known preserved production failure must be acknowledged, record the exact reason, owner, and expiry/review condition.

## Controlled restart verification

After both production canaries pass and the queues are idle:

1. Confirm no post-cutoff pending/running jobs are active.
2. Request a normal Coolify redeploy/restart of only the Agent Workbench worker.
3. Require `worker_stop_requested`, `worker_stopped`, then `worker_started`.
4. Verify the exact same production cutoff remains loaded.
5. Verify one replica, no OOM kill, and no restart loop.
6. Re-run queue health and the historical pre-cutoff snapshot comparison.

## Rollback

Rollback is designed to stop new consumption without mutating queue history.

If the production worker behaves unexpectedly:

1. Stop or disable only the Agent Workbench worker resource in production Coolify.
2. Do not delete or rewrite queue rows.
3. Preserve logs, deployment SHA, queue snapshots, and failed run/job IDs.
4. Revert to the last known-good worker image/SHA if a code rollback is appropriate.
5. Keep the **same production cutoff** during rollback/redeploy. Never move it backward.
6. Verify `worker_started` with the unchanged cutoff before resuming canaries or normal consumption.
7. Escalate provider/tool-side duplicate-effect concerns separately because queue lease recovery cannot make arbitrary external side effects transactional.

## Secrets and access

- Production service-role and provider keys exist only in the production Coolify secret store and other explicitly approved production systems.
- Do not copy production secrets to the laptop validation Coolify instance.
- Do not expose the worker via a public route.
- Restrict production Coolify administration and VPS SSH access to operators.
- Rotate any credential that is accidentally exposed.

## Backup and disaster recovery boundary

The worker is stateless. Durable execution state lives in Supabase/Postgres.

Production worker cutover does not replace the separate database backup/restore rehearsal tracked by the production-readiness work. Do not treat successful worker deployment as proof of database disaster recovery.

## Closure criteria for issue #33

Issue #33 can close only after all of the following are evidenced on the dedicated production VPS:

- always-on Coolify worker exists and runs the reviewed `main` contract;
- production cutoff and secrets are configured safely;
- historical pre-cutoff backlog remains unchanged;
- one production-safe agent run completes;
- one production-safe evaluation completes;
- queue health/monitoring thresholds are established;
- graceful restart behavior is verified;
- logs expose queue/run correlation identifiers;
- rollback steps are documented and tested at least at the controlled-restart level;
- operational ownership is explicit.

Until those conditions are met, the laptop Coolify remains validation infrastructure only and must not be described as the production worker host.
