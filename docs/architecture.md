# Architecture

This document describes the high-level architecture of Agent Workbench.

Components

- Users (developers, operators)
- Next.js App (apps/web) — UI and App Router
- API Routes — Next.js server routes for application operations
- Supabase — Postgres, Auth, Realtime, Edge Functions
- Queue — Durable job table (`agent_run_jobs`) and RPCs for dequeue/reclaim
- Agent Runtime (packages/agent-runtime) — worker processes, LLM integrations, tool execution
- SDK (packages/sdk) — server helpers and typed DB access
- LLM Providers — OpenAI, mock provider, etc.

Request flow

User → Next.js UI → POST /api/agent/run → authorizeExecution → persist user message → reserve quota → enqueueAgentRun → agent_run_jobs (pending)

Worker flow

Worker polls `dequeue_agent_run_job` → claims job → runAgent/runMultiAgentWorkflow → persist execution trace and telemetry → mark run completed/failed → publish realtime events via Supabase channels

Realtime

Run-level realtime updates are delivered via Supabase Realtime channels scoped to `run:{runId}`. UI subscribes to these channels to show `RunDetailLive` updates.

Security & Multi-tenancy

- Row-Level Security (RLS) protects user and org-scoped rows.
- Service role key is required for server-side SDK operations.
- Organization quotas are reserved during run creation.

Operational notes

- Use the `reclaim_stale_agent_run_jobs` RPC to recover stuck jobs.
- Monitor `agent_run_jobs` queue length and DLQ for failed jobs.

For more details see `database-schema.md` and `deployment.md`.
