# Phase 3 Planning

## Grounded Architecture Status

- Frontend: `apps/web` uses Next.js App Router with authenticated routes under `(authenticated)` and server-side Supabase session checks.
- Auth: Supabase Auth via `@supabase/auth-helpers-nextjs`, browser `createBrowserSupabaseClient`, and session cookies.
- Database: Supabase tables include `agent_runs`, `agent_run_jobs`, `organizations`, `organization_memberships`, `org_billing`, `tool_calls`, `marketplace_agents`, `conversations`, and agent metadata.
- SDK: shared `packages/sdk` exposes `agentRuns`, `orgs`, `tools`, `marketplace`, and realtime subscriptions.
- Runtime: `packages/agent-runtime` implements queueing, worker processing, LLM provider integration, tool execution, and telemetry updates.
- Observability: current UI surfaces include Run Detail, Trace Explorer, Org Billing, Org Trace Analytics, and marketplace browsing.

## Current Gaps and Risks

- Playwright end-to-end validation is incomplete, particularly Windows dev-server compatibility and analytics flow coverage.
- Org-level telemetry and billing are surfaced, but need stronger verification and quota enforcement.
- Runtime observability is present in trace pages, but tooling is still basic and lacks search/filter maturity.
- Provider abstraction exists, but fallback, quota handling, and multi-provider resilience are not fully hardened.
- Role-based access and multi-org isolation are partially implemented; RLS and shared-auth boundaries need audit.

## Phase 3 Scope (Concrete Deliverables)

1. Solidify agent lifecycle management
   - Agent create/edit flows (`apps/web/src/app/(authenticated)/agents/*`)
   - Agent version awareness in marketplace and run history
   - Run history pages with replay links and status details
   - Replay tooling on `apps/web/src/app/(authenticated)/runs/[runId]/replay`

2. Expand observability and analytics
   - Strengthen Trace Explorer filters and search by status/tool/query
   - Improve Org Trace Analytics and Org Billing dashboards
   - Add tool-call analytics and runtime error reporting
   - Surface model usage, total tokens, cost, latency, and step-level metrics clearly

3. Harden organization & access controls
   - Verify org membership flows in `packages/sdk/src/orgs.ts` and org pages in `apps/web/src/app/(authenticated)/orgs/*`
   - Audit RLS policies in `supabase/migrations` for tenant isolation
   - Enforce billing/quota checks in runtime and runtime API paths
   - Add org-scoped role labels and access restrictions where appropriate

4. Stabilize runtime execution and monitoring
   - Validate queue worker recovery, retry, and dead-letter handling in `packages/agent-runtime/src/queue.ts` and `worker.ts`
   - Persist rich execution steps and make them queryable in trace pages
   - Add realtime run updates and a more informative run status experience

5. Improve provider abstraction and resilience
   - Add generic provider adapter and fallback logic in `packages/agent-runtime/src/llm`
   - Track provider-level errors, model metadata, and cost attribution consistently
   - Support provider selection per agent or org in configuration UI

## Priority Workstreams

1. Phase 2 completion first
   - Finish Playwright on Windows using `reuseExistingServer`
   - Verify login and analytics flows end-to-end
   - Confirm `apps/web/.env` and browser-visible Supabase env handling

2. Org & billing experience
   - Verify `OrgBillingPage`, `OrgTraceExplorerPage`, and `OrgTraceAnalytics`
   - Ensure `agentRuns.orgTelemetry` matches billing page metrics
   - Harden `orgs.recordRunUsage` and `orgs.checkQuota`

3. Trace/replay UX
   - Complete trace summary and step details in `TraceExplorerPage`
   - Improve `RunDetailClient` and replay page visibility for completed runs
   - Add explicit trace search and tool name filtering

4. Runtime reliability and telemetry
   - Audit worker state transitions in `packages/agent-runtime/src/worker.ts`
   - Add better failure handling and diagnostic logging
   - Ensure execution steps and tool-call metadata are persisted and used by UI

5. Developer tooling and docs
   - Update README roadmap to reflect Phase 3 focus on MCP-style platform and observability
   - Document E2E assumptions and test setup for local dev on Windows
   - Add focused test fixtures for org isolation and analytics validation

## Success Criteria

- Playwright E2E passes for authentication, agent run creation, trace explorer, org trace analytics, and billing.
- Org billing dashboard reflects actual run telemetry and fee calculations.
- Trace explorer supports filtering by status, tool, and query text.
- Run replay and detail pages load completed runs with execution trace metadata.
- Runtime worker queue handles retries and records errors without losing job state.
- SDK and frontend code support org-scoped access patterns cleanly.

## Suggested Next Actions

- Run a focused audit of `packages/sdk/src/orgs.ts`, `packages/agent-runtime/src/worker.ts`, `apps/web/src/app/(authenticated)/orgs/[orgId]`, and `apps/web/src/app/(authenticated)/traces/page.tsx`.
- Add a Phase 3 task list in the repo issues or project board with these concrete milestones.
- Reserve a small spike to finalize Windows Playwright dev-server configuration before broad E2E validation.

This feature is recruiter/demo friendly because it demonstrates a complete, enterprise-style monitoring experience for AI agents.
