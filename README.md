# Agent Workbench

**Current release: v0.4.0**

Build, evaluate, observe, and operate AI agents on Supabase.

Agent Workbench is an open-source developer platform for versioned agent execution, evaluation, observability, marketplace workflows, and multi-tenant operations.

## Current status

Agent Workbench is a production-oriented pre-release platform. The backend architecture is substantially implemented, while several developer-platform and provider-expansion capabilities remain planned.

### Implemented

- Agent creation and versioning
- Version-aware agent execution
- Single-agent and multi-agent workflow execution
- Memory retrieval and embeddings
- Tool execution loop
- Background agent-run queue
- Retry, stale-job recovery, and dead-letter behavior
- Run traces, replay foundations, token usage, latency, and cost telemetry
- Evaluation datasets, examples, evaluation runs, and persisted results
- Version-to-version experiments
- Organization-scoped multi-tenancy and RBAC
- Marketplace publish, install, and fork workflows
- Organization quota enforcement and append-only usage events
- Realtime run and execution-step updates
- Hermetic contributor validation plus separate integration, security, reliability, and E2E suites

### Beta / stabilization

- OpenAI is the only live LLM provider currently registered; a mock provider is available for explicit test use
- Cost estimates are based on a local pricing catalog; unknown model pricing is represented as unknown rather than silently treated as free
- Multi-agent workflow failures may fall back to the single-agent runtime, with fallback state recorded in execution traces
- Evaluation and experiment execution is currently synchronous and is the next major architecture target
- The current tool loop uses a structured text protocol rather than provider-native tool/function calling

### Planned

- Queued evaluation and experiment execution with progress, retry, cancellation, and recovery
- Additional model providers such as Anthropic, Gemini, and OpenRouter
- Provider health, retry, and pricing-registry improvements
- Provider-native structured tool calling and richer streaming
- Public API authentication and API keys
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

- version-aware model and system-prompt selection
- conversation persistence
- memory retrieval
- embeddings
- tool invocation
- multi-agent workflow routing
- single-agent fallback
- persisted trace events
- token and latency telemetry
- estimated-cost telemetry when model pricing is known

Provider behavior is intentionally strict: missing OpenAI credentials fail with a configuration error unless `USE_MOCK_OPENAI=true` is explicitly set, and unsupported provider names are rejected instead of silently becoming OpenAI.

## Evaluations and experiments

The evaluation system currently supports:

- dataset creation and example management
- evaluation runs against agent versions
- exact-match scoring
- result persistence
- latency, token, trace, and cost aggregation
- A/B-style experiments between two agent versions

Evaluation examples and experiment arms are currently executed synchronously. Moving this work onto durable queues is the next major engineering milestone.

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
- Vitest
- Playwright
- k6
- GitHub Actions

## Roadmap

The original phase-based roadmap has been retired because the repository has outgrown it. The roadmap now tracks engineering maturity.

### v0.5 — Runtime Stabilization

- [x] Hermetic default validation
- [ ] Strict provider selection and configuration behavior
- [ ] Explicit unknown-cost semantics
- [ ] Observable workflow fallback behavior
- [ ] Truthful capability and release documentation
- [ ] Security validation integrated into the appropriate protected-branch lifecycle

### v0.6 — Async Evaluations

- [ ] Queue evaluation runs
- [ ] Queue experiment execution
- [ ] Per-example progress
- [ ] Retry and recovery
- [ ] Cancellation
- [ ] Durable aggregation and completion semantics

### v0.7 — Model Platform

- [ ] Additional live providers
- [ ] Provider-specific retry policies
- [ ] Provider health reporting
- [ ] Versioned pricing registry

### v0.8 — Agent Tooling

- [ ] Provider-native tool/function calling
- [ ] Richer streaming
- [ ] Stronger workflow-runtime semantics

### v0.9 — Developer Platform

- [ ] Public API authentication
- [ ] API keys
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
