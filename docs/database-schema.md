# Database Schema (Overview)

This file summarizes important tables and functions used by Agent Workbench.

Key tables

- `users` / `auth.users` — managed by Supabase Auth
- `profiles` — user profile metadata
- `agents` — agent records (owner/org, system prompt, default model)
- `agent_versions` — immutable versioned agent configuration and workflow
- `conversations` — conversation records per user/agent
- `messages` — conversation messages (user/assistant) with optional `embedding` vector
- `agent_runs` — top-level run record (status, telemetry, execution_trace)
- `agent_run_jobs` — durable queue for background execution
- `agent_run_events` — tracing events emitted during execution
- `tool_calls` — audit trail for external tool invocations
- `evaluation_runs`, `evaluation_run_results` — evaluation engine storage
- `organization_usage_events`, `org_billing` — billing/usage ledger

Notable RPCs / functions

- `dequeue_agent_run_job()` — claim next pending job (implements SKIP LOCKED)
- `reclaim_stale_agent_run_jobs(lease_interval)` — reclaim stuck jobs
- `match_messages(query_embedding, match_threshold, match_count)` — semantic search over message embeddings

RLS policies

RLS policies limit access to rows by `auth.uid()` and by organization membership for org-scoped resources. See `supabase/migrations/*` for exact policy definitions.

Indexes

- `agent_run_jobs` — index on `status`, `created_at`
- `messages` — vector index on `embedding` (pgvector)
- `agent_runs` — index on `organization_id`, `status`

Migration files are under `supabase/migrations/`.
