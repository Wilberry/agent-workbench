# Deployment Guide (Overview)

This document outlines deployment considerations for production.

Recommended architecture

- Host Next.js (apps/web) on Vercel or a Node+Edge runtime.
- Use a managed Supabase project for Postgres, Auth, Realtime, and Edge Functions.
- Run background workers (agent-runtime) in a managed container service (Kubernetes, AWS ECS, or GCP Cloud Run).
- Store secrets in a secrets manager and inject at runtime (SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY).

Operational concerns

- Scale workers horizontally based on `agent_run_jobs` queue length and average processing latency.
- Configure health checks and readiness probes for worker processes.
- Monitor queue DLQ and implement alerts for failure rate spikes.
- Configure backup and PITR for the database.

CI/CD

- Use `pnpm build` to verify Next.js builds and typecheck.
- Run `pnpm validate` for hermetic lint, type, build, and unit-test coverage.
- Run `pnpm test:integration`, `pnpm test:security`, and
  `pnpm test:reliability` in separate jobs configured with their required
  external credentials. `pnpm test:all` is not hermetic.
- Deploy tags/releases via GitHub Actions and create release notes for each tag.

Security

- Never embed `SUPABASE_SERVICE_ROLE_KEY` in client bundles.
- Restrict access to service role keys and rotate periodically.
