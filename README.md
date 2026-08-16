# Agent Workbench

**Current release: v0.4.0**  
**Current engineering milestone: v1.0 production release readiness**

Build, evaluate, observe, and operate AI agents on Supabase.

Agent Workbench is an open-source developer platform for versioned agent execution, evaluation, observability, marketplace workflows, and multi-tenant operations.

## Current status

Agent Workbench is a production-oriented pre-release platform. The engineering milestones through v0.9 Developer Platform are implemented, and the repository-side v1.0 hardening work is largely complete. The remaining v1.0 work is release execution and production evidence rather than new product scope.

The current release remains v0.4.0 until the final v1.0 release candidate passes hosted release evidence, always-on worker cutover, disaster-recovery rehearsal, and monitored canary gates. See issue #31 and `docs/operations/release-cutover.md` for the live release plan.

### Implemented

- Agent creation and versioning
- Version-aware agent execution
- Explicit provider/model selection for agent and version configuration
- Live OpenAI and Anthropic model providers
- Provider-aware pricing, retry, timeout, readiness, and telemetry behavior
- Provider-neutral streaming across OpenAI and Anthropic
- Live agent SSE events for text deltas, tool-call lifecycle, usage, completion, and errors
- Single-agent and multi-agent workflow execution
- Memory retrieval and embeddings
- Provider-native tool/function calling with version-pinned tool allowlists
- Background agent-run queue
- Retry, stale-job recovery, and dead-letter behavior
- Run traces, replay foundations, token usage, latency, and cost telemetry
- Explicit interactive and durable agent-run cancellation semantics
- Durable continuation and completion checkpoints for workflow recovery without replaying completed tool side effects
- Evaluation datasets, examples, evaluation runs, and persisted results
- Durable queued evaluation and experiment execution with progress, retry, recovery, and cooperative cancellation
- Version-to-version experiments
- Organization-scoped multi-tenancy and RBAC
- Marketplace publish, install, and fork workflows
- Organization quota enforcement and append-only usage events
- Realtime run and execution-step updates
- Organization-scoped public API keys with hashed-at-rest credentials, scopes, expiry, and revocation
- Authenticated public API access for organization agent discovery
- Isolated external SDK client for API-key-authenticated public API workflows
- Node 22 CLI with `awb agents list`, human-readable and JSON output, and environment-based secret handling
- Hermetic contributor validation plus separate integration, security, reliability, and E2E suites
- Production web liveness/readiness and deployment smoke contracts
- Production worker supervisor with safe queue-cutover fencing
- Cutover-aware queue-health monitoring and historical-backlog quarantine
- Same-SHA release/security evidence aggregation
- Repository-owned logical database backup and disaster-recovery runbooks

### Beta / stabilization

- OpenAI and Anthropic are live providers; a mock provider is available for explicit test use
- Provider/model selection is limited to configured providers and metered catalog models, while an existing metered selection can remain visible if its provider is temporarily unconfigured
- Cost estimates use a versioned provider-aware local pricing catalog; unknown or unmetered provider/model pairs fail explicitly
- Buffered provider requests use bounded retries, Retry-After handling, request timeouts, and durable queue recovery for retryable failures
- Streaming provider requests may retry only before the first response byte; once output has been emitted, failures are surfaced instead of replaying partial text or tool-call deltas
- Multi-agent workflow failures may fall back to the single-agent runtime, except after tool side effects where fallback/replay is intentionally disabled
- Evaluation cancellation is cooperative between examples; an already-started provider request may finish before the worker observes cancellation
- Native tool/function calling is the primary runtime path; the legacy structured-text `TOOL_CALL` protocol remains temporarily as a compatibility fallback
- Agent-run cancellation is actively propagated in-process and cooperatively observed across durable workers; an already-running external tool may finish before cross-process cancellation is observed
- The initial public API and CLI surfaces are read-only and limited to organization agent discovery while additional versioned endpoints are stabilized
- Always-on worker hosting is not yet enabled in production; the worker deployment contract is ready but the chosen Render background worker requires paid compute
- GitHub-hosted release evidence is currently blocked by an account/billing runner lock, tracked in issue #18
- Disaster-recovery tooling is implemented, but the actual production backup and isolated restore rehearsal remains an explicit release gate

### Planned

- Complete the remaining v1.0 production evidence gates and cut the platform release
- Broader provider coverage after v1.0 stabilization
- MCP expansion
- Knowledge ingestion and RAG workflows

## Repository structure

```text
apps/
└── web/

packages/
├── agent-runtime/
├── cli/
├── sdk/
├── mcp/      # reserved/planned workspace
├── evals/    # reserved/planned workspace; current eval implementation lives in sdk
└── ui/       # reserved/planned workspace

infrastructure/
└── supabase/

tests/
```

## Runtime

The current runtime supports:

- version-aware provider, model, system-prompt, workflow, and tool selection
- live OpenAI and Anthropic execution
- provider-aware pricing and telemetry
- buffered and provider-native streaming completion paths
- normalized `response_start`, text-delta, tool-call, usage, and `response_end` events
- live SSE agent execution through `runAgentEventStream()` with disconnect-driven cancellation
- bounded provider retries, Retry-After handling, and request timeouts
- streaming retry only before the first emitted byte
- local non-billable provider readiness reporting
- conversation persistence
- memory retrieval
- embeddings
- provider-native tool/function calling
- version-pinned built-in and tenant-scoped registry tool allowlists
- server-owned agent/conversation context injection for built-in tools
- multi-agent workflow routing with role-tagged streaming events
- single-agent fallback when replay is side-effect safe
- cooperative durable cancellation and resumable workflow checkpoints
- persisted trace events
- token and latency telemetry
- estimated-cost telemetry when provider/model pricing is known

Provider behavior is intentionally strict: missing provider credentials fail with configuration errors, unsupported provider names are rejected instead of silently becoming OpenAI, and user-facing configuration only exposes metered provider/model pairs from the runtime catalog.

## Evaluations and experiments

The evaluation system currently supports:

- dataset creation and example management
- durable queued evaluation runs against agent versions
- queued A/B-style experiments between two agent versions
- exact-match scoring
- per-example progress and persisted result checkpoints
- retry, stale-job recovery, and durable completion semantics
- cooperative cancellation for queued/running evaluations and experiments
- latency, token, trace, and cost aggregation

With v0.6 Async Evaluations, v0.7 Model Platform, v0.8 Agent Tooling, and v0.9 Developer Platform implementation complete, the project is now executing the final v1.0 production-readiness gates.

## Testing and validation

The canonical hermetic contributor gate is:

```bash
pnpm validate
```

It runs:

```text
lint
→ typecheck
→ build
→ unit tests
```

External suites are intentionally separate:

```bash
pnpm test:integration
pnpm test:security
pnpm test:reliability
pnpm test:e2e
```

The final platform release additionally requires same-SHA hosted evidence and the production cutover checks documented in `docs/operations/release-cutover.md`.

See `docs/local-development.md` for environment requirements.

## Technology stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend and data

- Supabase
- PostgreSQL
- pgvector
- Supabase Auth
- Realtime

### Runtime and testing

- TypeScript agent runtime
- OpenAI
- Anthropic
- Vitest
- Playwright
- k6
- GitHub Actions

## Roadmap

The original phase-based roadmap has been retired because the repository has outgrown it. The roadmap now tracks engineering maturity.

### v0.5 — Runtime Stabilization

- [x] Hermetic default validation
- [x] Strict provider selection and configuration behavior
- [x] Explicit unknown-cost semantics
- [x] Observable workflow fallback behavior
- [x] Truthful capability and release documentation
- [x] Security validation integrated into the main/release lifecycle

### v0.6 — Async Evaluations

- [x] Queue evaluation runs
- [x] Queue experiment execution
- [x] Per-example progress
- [x] Retry and recovery
- [x] Cancellation
- [x] Durable aggregation and completion semantics

### v0.7 — Model Platform

- [x] Additional live providers
- [x] Provider-specific retry policies
- [x] Provider health reporting
- [x] Versioned pricing registry
- [x] Provider/model selection surface backed by configured, metered catalog entries

### v0.8 — Agent Tooling

- [x] Provider-native tool/function calling
- [x] Richer streaming
- [x] Stronger workflow-runtime semantics

### v0.9 — Developer Platform

- [x] Public API authentication
- [x] API keys
- [x] CLI
- [x] Polished external SDK workflows

### v1.0 — Production Release

Repository-side engineering:

- [x] Production web liveness/readiness and deployment smoke contract
- [x] Production queue observability and operational runbooks
- [x] Stable public API/SDK/CLI compatibility contract
- [x] Same-SHA release/security evidence workflow
- [x] Production worker supervisor and safe queue-cutover fence
- [x] Database backup tooling and disaster-recovery/rollback runbook

Release execution still required:

- [ ] Restore GitHub-hosted Actions and produce green same-SHA release evidence (#18)
- [ ] Deploy and verify the always-on production worker (#33)
- [ ] Execute the production backup and isolated restore rehearsal (#45)
- [ ] Complete monitored production canary and final release cut
- [ ] Publish the `v1.0.0` Git tag and GitHub Release

### Post-1.0

- MCP expansion
- Knowledge ingestion and RAG
- Broader provider coverage
- Broader payment and commercial lifecycle support

## Local development

See `docs/local-development.md` for hosted Supabase setup, optional local Supabase setup, migrations, and test-environment requirements.

## Security

The project uses Supabase Row Level Security, organization-based multi-tenancy, server-side execution authorization, quota enforcement, and dedicated security tests. Security-sensitive external suites require configured credentials and are kept separate from hermetic contributor validation.

See `SECURITY.md` for project security guidance.

## Contributing

See `CONTRIBUTING.md` and run `pnpm validate` before opening a pull request.

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
