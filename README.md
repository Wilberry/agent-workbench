# Agent Workbench

**Current release: v0.4.0**

Build, evaluate, observe, and operate AI agents on Supabase.

Agent Workbench is an open-source developer platform for versioned agent execution, evaluation, observability, marketplace workflows, and multi-tenant operations.

## Current status

Agent Workbench is a production-oriented pre-release platform. The backend architecture and v0.8 Agent Tooling foundations are substantially implemented, and v0.9 Developer Platform work has started with public API authentication and organization-scoped API keys.

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
- Hermetic contributor validation plus separate integration, security, reliability, and E2E suites

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
- The initial public API surface is read-only and limited to organization agent discovery while additional versioned endpoints are stabilized

### Planned

- Broader provider coverage after the provider-selection and observability UX is stable
- CLI and polished external SDK workflows
- MCP expansion
- Knowledge ingestion and RAG workflows

## Repository structure

```text
apps/
└── web/

packages/
├── agent-runtime/
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

With v0.6 Async Evaluations, v0.7 Model Platform, and v0.8 Agent Tooling complete, v0.9 Developer Platform is in progress. Public API authentication and API-key foundations are implemented; CLI and external SDK workflows remain next.

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
- [ ] Security validation integrated into the appropriate protected-branch lifecycle

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
- [ ] CLI
- [ ] Polished external SDK workflows

### v1.0 — Production Release

- [ ] Production deployment guarantees
- [ ] Release and security evidence
- [ ] Production-grade observability guarantees
- [ ] Stable public contracts

### Post-1.0

- MCP expansion
- Knowledge ingestion and RAG
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
