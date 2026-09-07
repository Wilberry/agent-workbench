# Agent Workbench Roadmap

> **Canonical roadmap and scope authority**
>
> This file is the single source of truth for Agent Workbench milestone scope, milestone order, and planned engineering direction.

## Roadmap governance

This roadmap is **owner-controlled**.

- Roadmap scope, milestone names, milestone order, acceptance goals, additions, removals, and reprioritization must not be changed without explicit approval from the repository owner, `@Wilberry`.
- Contributors, coding agents, automation, audits, and documentation updates may propose roadmap changes, but must not apply them unless the owner has explicitly approved the roadmap change.
- Implementation progress does **not** require editing this file. Live progress belongs in [`STATUS.md`](./STATUS.md).
- Issues, pull requests, README sections, audit reports, and planning documents may summarize this roadmap, but when they disagree with this file, **this file wins**.
- Completing a milestone does not authorize automatically expanding the next milestone.
- Emergency production fixes may be implemented when necessary, but they do not silently redefine roadmap scope.

## Product direction

Agent Workbench is a developer platform for building, testing, evaluating, observing, debugging, and operating AI agents on Supabase.

The long-term product direction combines the useful parts of an AI-agent workbench, evaluation platform, observability system, MCP tooling environment, and Supabase-native developer platform.

Core platform technologies include Supabase, PostgreSQL, pgvector, TypeScript, Next.js, provider-neutral AI runtime infrastructure, MCP, and production-grade evaluation and observability systems.

---

## v0.5 — Runtime Stabilization

Goal: establish trustworthy runtime behavior and a clean contributor validation contract.

Scope:

- Hermetic default validation
- Strict provider selection and configuration behavior
- Explicit unknown-cost semantics
- Observable workflow fallback behavior
- Truthful capability and release documentation
- Security validation integrated into the main/release lifecycle

---

## v0.6 — Async Evaluations

Goal: make evaluations and experiments durable production workloads rather than synchronous demo flows.

Scope:

- Queue evaluation runs
- Queue experiment execution
- Per-example progress
- Retry and recovery
- Cancellation
- Durable aggregation and completion semantics

---

## v0.7 — Model Platform

Goal: provide a strict provider-neutral model execution layer.

Scope:

- Additional live providers
- Provider-specific retry policies
- Provider health reporting
- Versioned pricing registry
- Provider/model selection backed by configured, metered catalog entries

---

## v0.8 — Agent Tooling

Goal: strengthen runtime tooling and workflow semantics.

Scope:

- Provider-native tool/function calling
- Richer streaming
- Stronger workflow-runtime semantics

---

## v0.9 — Developer Platform

Goal: expose a stable first external developer surface.

Scope:

- Public API authentication
- Organization-scoped API keys
- CLI
- External SDK workflows
- Compatibility and versioning contracts

---

# v1.0 — Production Release

Goal: prove that the implemented platform can be released and operated safely in production.

v1.0 is a **release-readiness milestone**, not a feature-expansion milestone.

Required release gates:

- Production web liveness/readiness and deployment smoke contract
- Production worker implementation and safe queue-cutover fence
- Queue observability and operational runbooks
- Stable public API/SDK/CLI compatibility contract
- Same-SHA release and security evidence contract
- Database backup tooling and disaster-recovery/rollback contract
- Executed production backup and isolated restore rehearsal
- Always-on production worker cutover
- Hosted CI release evidence on one exact release-candidate SHA
- Production-safe agent and evaluation canaries
- Monitored production canary window
- Final release documentation and version alignment
- `v1.0.0` Git tag and GitHub Release

### v1.0 scope rule

Do not add MCP expansion, RAG expansion, new providers, major new product surfaces, or unrelated architectural rewrites merely to make v1.0 feel larger. Only changes needed to satisfy a release gate or fix a release blocker belong in v1.0.

---

# v1.1 — MCP + Knowledge Platform

Goal: join Agent Workbench's tool runtime, Supabase/Postgres foundation, pgvector capabilities, and evaluation system into one coherent MCP and knowledge platform.

Engineering sequence:

1. MCP transport/server foundation
2. Tool registry and permissions
3. PostgreSQL MCP
4. Documentation MCP
5. Document ingestion
6. Chunking and embeddings
7. pgvector retrieval
8. Hybrid retrieval
9. Vector-search MCP
10. Agent RAG integration
11. Trace and evaluation coverage for MCP/RAG workflows

Expected product capabilities:

- Register and manage MCP servers/tools
- Install and enable tools under explicit permissions
- Safely expose PostgreSQL-oriented tools
- Search and retrieve documentation through MCP
- Ingest supported knowledge sources
- Store and query embeddings with pgvector
- Combine vector and keyword retrieval
- Use retrieved knowledge during agent execution
- Trace, evaluate, and regression-test MCP/RAG behavior

---

# v1.2 — Evaluation Intelligence

Goal: deepen evaluation quality after the durable evaluation platform is established.

Scope:

- LLM-as-judge evaluation
- Hallucination / groundedness evaluation
- Tool-correctness metrics
- Regression thresholds and release-quality gates
- Richer experiment analytics
- Evaluation quality, reliability, and cost controls

---

# v1.3 — Platform Expansion

Goal: broaden the developer platform after the core runtime, production, MCP/knowledge, and evaluation foundations are stable.

Scope:

- Broader public API
- CLI expansion
- Additional model providers
- Deployment workflows
- Broader SDK workflows
- Commercial/payment lifecycle support where appropriate

---

## Deferred ideas and proposals

Ideas that do not fit the approved milestone scope must be recorded as issues, discussions, or proposals. They must not be silently inserted into this roadmap.

## Status tracking

For current milestone state, release blockers, completed evidence, and the next engineering action, see [`STATUS.md`](./STATUS.md).
