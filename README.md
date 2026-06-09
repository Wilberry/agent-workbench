Agent Workbench

Build, evaluate, observe and deploy AI agents on Supabase.

Agent Workbench is an open-source developer platform for building, testing, evaluating, observing and deploying AI agents.

Inspired by tools like LangSmith, OpenAI Playground, PostHog and MCP Inspector, Agent Workbench provides a unified environment for agent development, evaluation, observability and deployment—built natively on Supabase.

---

Why Agent Workbench?

Building AI agents in production is difficult.

Developers need tools to:

- Build and iterate on agents
- Test prompts and workflows
- Evaluate performance
- Monitor production usage
- Debug failures
- Manage tools and integrations
- Deploy reliably

Agent Workbench brings these capabilities together in a single platform.

---

Core Features

Agent Development

- Create and manage AI agents
- Configure prompts and models
- Build multi-step workflows
- Support for LangGraph-based agents

Evaluation Engine

- Dataset management
- Automated benchmark execution
- Regression testing
- Hallucination detection
- Cost and latency analysis

Observability

- Request tracing
- Tool execution tracking
- Token usage analytics
- Execution graph visualization
- Failure analysis

MCP Integration

- MCP server registry
- Tool discovery
- Permission management
- Custom MCP server support

Knowledge Base

- Document ingestion
- Vector search
- Hybrid retrieval
- Retrieval-Augmented Generation (RAG)

Developer Experience

- SDK
- CLI
- REST API
- Open-source architecture

---

Technology Stack

Frontend

- Next.js
- TypeScript
- Tailwind CSS
- React

Backend

- Supabase
- PostgreSQL
- pgvector
- Edge Functions
- Realtime

AI Runtime

- LangGraph
- OpenAI
- Anthropic
- Gemini

Infrastructure

- Docker
- GitHub Actions
- Playwright
- k6

---

Architecture

Frontend (Next.js)
       |
       |
API Layer
       |
       |
Supabase
├── PostgreSQL
├── pgvector
├── Auth
├── Storage
├── Realtime
└── Edge Functions
       |
       |
Agent Runtime
├── LangGraph
├── OpenAI
├── Anthropic
├── Gemini
└── MCP Clients

---

Project Structure

agent-workbench/

apps/
└── web/

packages/
├── agent-runtime/
├── sdk/
├── mcp/
├── evals/
└── ui/

infrastructure/
└── supabase/

docs/

examples/

---

Roadmap

Phase 1 — Foundation

- [ ] Monorepo setup
- [ ] Supabase project setup
- [ ] Authentication
- [ ] Database schema
- [ ] CI/CD pipeline

Phase 2 — Agent Runtime

- [ ] LangGraph integration
- [ ] Model abstraction layer
- [ ] Tool execution framework
- [ ] Agent execution engine

Phase 3 — MCP Platform

- [ ] MCP registry
- [ ] PostgreSQL MCP server
- [ ] Documentation MCP server
- [ ] Vector Search MCP server

Phase 4 — Observability

- [ ] Trace collection
- [ ] Trace explorer
- [ ] Execution graph
- [ ] Cost analytics

Phase 5 — Evaluation Engine

- [ ] Dataset management
- [ ] Benchmark execution
- [ ] Regression testing
- [ ] Hallucination detection

Phase 6 — Knowledge Platform

- [ ] Document ingestion
- [ ] Embedding generation
- [ ] Hybrid search
- [ ] RAG workflows

Phase 7 — Developer Tooling

- [ ] SDK
- [ ] CLI
- [ ] Public API
- [ ] Documentation site

---

Security

Agent Workbench is designed with production-grade security in mind.

Features include:

- Row Level Security (RLS)
- Organization-based multi-tenancy
- JWT validation
- Audit logging
- Rate limiting
- Secret management through Supabase Edge Functions

---

Testing

Testing is a first-class concern.

Unit Tests

- Target coverage: 80%+

Integration Tests

- Agent execution
- MCP tools
- Vector search

End-to-End Tests

- Create agent
- Execute agent
- Run evaluations

Load Testing

- 100 concurrent users
- 500 concurrent users
- 1000 concurrent users

---

Contributing

Contributions are welcome.

Please read:

- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- SECURITY.md

before submitting pull requests.

---

License

Licensed under the Apache License 2.0.

See the LICENSE file for details.

---

Vision

Agent Workbench aims to become the open-source platform developers use to build, evaluate, observe and deploy AI agents at scale.

Built with ❤️ using Supabase, LangGraph, MCP and pgvector.
