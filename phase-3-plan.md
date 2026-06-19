# Phase 3 Planning

## Current Architecture Status

- Frontend: Next.js App Router with authenticated and public routes
- Auth: Supabase Auth using browser client and session cookies
- Backend/data: Supabase database with agent runs, traces, organizations, billing, and analytics telemetry
- SDK: shared `@agent-workbench/sdk` layer for Supabase access and telemetry aggregation
- Runtime: `packages/agent-runtime` supports agent execution, queueing, and LLM provider integrations
- Analytics: run-level and trace-level metrics include token counts, costs, latency, and model metadata

## Remaining Roadmap Milestones

- Complete Playwright end-to-end validation for login and analytics flows
- Finish analytics verification for Run Detail, Trace Explorer, Organization Analytics, and Billing
- Harden dev data seeding and organization fixture coverage
- Add observability for agent runtime, tool calls, and error reporting
- Stabilize cross-org isolation and access controls

## Recommended Phase 3 Scope

- Build strong agent lifecycle management and monitoring:
  - agent creation, editing, versioning, and execution history
  - runtime diagnostics and replay tooling
- Improve observability and operator UX:
  - dashboards for cost, latency, usage trends, and alerts
  - search/filter for traces, runs, and tool calls
- Expand provider support and integration resilience:
  - flexible LLM provider abstraction
  - provider fallback and quota handling
- Strengthen team/org collaboration:
  - multi-org/multi-team support
  - role-based access and billing visibility

## Highest-Impact Demo Feature

- A polished AI agent observability dashboard showing:
  - live and historical run counts
  - total tokens and estimated spend
  - average latency and model usage
  - trace search with replay capability

This feature is recruiter/demo friendly because it demonstrates a complete, enterprise-style monitoring experience for AI agents.
