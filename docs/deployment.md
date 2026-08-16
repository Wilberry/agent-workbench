# Deployment Guide (Overview)

This document outlines deployment considerations for production.

Recommended architecture

- Host Next.js (apps/web) on Vercel or a Node+Edge runtime.
- Use a managed Supabase project for Postgres, Auth, Realtime, and Edge Functions.
- Run background workers (agent-runtime) in a managed container service (Kubernetes, AWS ECS, or GCP Cloud Run).
- Store secrets in a secrets manager and inject at runtime (SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY).
- Use Node.js 22 for the web deployment. The repository pins Node 22 in the Vercel project root (`apps/web/package.json`) so hosted builds match the validated local runtime contract.

Background workers

- Agent execution workers consume `agent_run_jobs` through `startBackgroundWorker()` / `processAgentRunJob()`.
- Evaluation workers consume `evaluation_run_jobs` through `startEvaluationWorker()` or `processNextEvaluationRun()`.
- Evaluation workers are safe to restart: persisted `evaluation_run_results` act as per-example checkpoints, and stale queue leases can be reclaimed.
- Agent and evaluation workers can run in the same container deployment or scale independently when evaluation workloads become large.
- Apply `supabase/migrations/20260810023711_evaluation_run_queue.sql` before enabling queued evaluation execution.

Web liveness and readiness

The deployed web application exposes operational endpoints that do not require application authentication and must not expose secrets or backend error details. Hosting-platform deployment protection may still sit in front of these routes; preview smoke automation must authenticate through that perimeter before the request can reach the application.

### `GET /api/health/live`

Liveness confirms that the web process can serve requests. A healthy process returns HTTP 200:

```json
{
  "status": "ok",
  "service": "agent-workbench-web"
}
```

Liveness deliberately does not query Supabase or model providers. It should be used by infrastructure to distinguish a running process from one that is unavailable.

### `GET /api/health/ready`

Readiness confirms that the deployment has the required Supabase server configuration and can complete a bounded backend query. A ready deployment returns HTTP 200:

```json
{
  "status": "ready",
  "checks": {
    "configuration": "ok",
    "database": "ok"
  }
}
```

An unready deployment returns HTTP 503 with only non-secret check states. Configuration failures skip the database probe; database failures do not return the underlying Supabase error.

Provider credentials are intentionally not part of web readiness. Provider availability and model-specific readiness are operational concerns for agent execution and should be monitored separately from whether the web deployment can serve authenticated application traffic.

Deployment smoke check

After deploying a candidate, run the repository-owned smoke check against the deployment origin:

```bash
DEPLOYMENT_BASE_URL=https://your-agent-workbench.example.com pnpm smoke:deployment
```

You may also pass the origin as the first argument:

```bash
pnpm smoke:deployment -- https://your-agent-workbench.example.com
```

The smoke check requires both `/api/health/live` and `/api/health/ready` to return their expected HTTP 200 contracts. The base URL must be an origin only: credentials, paths, query strings, and fragments are rejected.

Vercel protected previews

If Vercel Deployment Protection is enabled for previews, configure Protection Bypass for Automation and provide the secret through the environment:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=... \
DEPLOYMENT_BASE_URL=https://your-preview.example.vercel.app \
pnpm smoke:deployment
```

The secret is sent only through the `x-vercel-protection-bypass` header. Do not place it in source control, deployment URLs, logs, or normal command output.

A redirect to Vercel SSO or an absence of application runtime logs for `/api/health/*` means the request was stopped by the hosting perimeter before Agent Workbench readiness code executed.

Operational concerns

- Scale agent workers based on `agent_run_jobs` queue length and average processing latency.
- Scale evaluation workers based on `evaluation_run_jobs` queue length, dataset size, and model latency.
- Configure health checks and readiness probes for worker processes.
- Monitor queue dead-letter/failure states and alert on sustained retry or failure-rate spikes.
- Follow `docs/operations/disaster-recovery.md` for backup, restore rehearsal, and database-aware rollback decisions.
- The current Free-plan Supabase deployment relies on independent logical backups; paid managed daily backups or PITR can be added later without replacing the repository recovery contract.

CI/CD

- Use `pnpm build` to verify Next.js builds and typecheck.
- Run `pnpm validate` for hermetic lint, type, build, and unit-test coverage.
- Run `pnpm test:integration`, `pnpm test:security`, and
  `pnpm test:reliability` in separate jobs configured with their required
  external credentials. `pnpm test:all` is not hermetic.
- Run `pnpm smoke:deployment` against a deployed candidate before promotion.
- Deploy tags/releases via GitHub Actions and create release notes for each tag.

Security

- Never embed `SUPABASE_SERVICE_ROLE_KEY` in client bundles.
- Restrict access to service role keys and rotate periodically.
- Never commit logical backup SQL, database connection strings, or backup manifests containing operator-local paths or secrets.
