# Production Readiness Report

## Overview

Agent Workbench has completed most of the repository-side engineering required for a v1.0 production release: durable execution, evaluation, tenant isolation, public contracts, health/readiness, queue observability, release-evidence aggregation, worker deployment contracts, and disaster-recovery tooling.

That is not the same as saying v1.0 is already released or that every production gate currently passes.

This report separates **implemented engineering controls** from **release evidence that still has to be executed**. The live execution plan is tracked in issue #31 and `docs/operations/release-cutover.md`.

## Validation Coverage

The repository contains dedicated validation for:

- unit behavior across runtime helpers, queues, provider contracts, SDK/CLI contracts, and operational tooling;
- integration behavior across API routes, SDK calls, and database contracts;
- browser-level E2E flows for authentication, conversations, runs, replay, tracing, evaluations, and organization isolation;
- security/RLS and authorization behavior;
- reliability behavior including queue retry/reclaim/dead-letter semantics;
- performance/load scenarios;
- production deployment liveness/readiness smoke checks;
- same-SHA release evidence aggregation across required hosted workflows and Vercel.

The canonical contributor gate remains `pnpm validate`. External suites remain separate because they require credentials and live dependencies.

## Implemented Production Controls

### Runtime and durability

- durable agent-run queue;
- durable queued evaluations/experiments;
- bounded retries and terminal failure semantics;
- stale lease recovery;
- cooperative cancellation;
- resumable workflow checkpoints;
- worker graceful-shutdown contract.

### Security and tenancy

- Supabase RLS;
- organization-scoped authorization/RBAC;
- API-key scope/expiry/revocation controls;
- dedicated security validation;
- tenant-isolation test coverage.

### Observability and operations

- liveness/readiness endpoints;
- deployment smoke tooling;
- queue health/age/stale-lease/failure signals;
- cutover-aware quarantine for historical queue rows;
- structured worker logging contract;
- run/token/cost/latency telemetry.

### Release and recovery

- stable public API compatibility contract;
- same-SHA release-evidence workflow;
- production worker Blueprint/runbook with a fail-closed cutover fence;
- logical database backup tooling with SHA-256 manifest evidence;
- database restore/rollback runbook;
- final release cutover runbook.

## Current v1.0 Release Gates

| Criterion | Current status | Release requirement |
|---|---|---|
| Repository validation contract | Implemented | Final candidate must pass hosted Validate evidence |
| Unit/integration/security/reliability/E2E suites | Implemented | Required suites must be green for the same final candidate SHA |
| GitHub-hosted CI execution | **Blocked externally** | Resolve #18 account/billing runner lock and rerun candidate evidence |
| Vercel production build/deploy | Operational | Exact final candidate SHA must be deployed and smoke-tested |
| Web liveness/readiness | Implemented | Must pass after final production promotion |
| Queue observability | Implemented | Active post-cutover queues must be healthy during canary |
| Production worker implementation | Implemented | Always-on worker hosting/cutover must be completed under #33 |
| Historical queue safety | Implemented | Pre-cutover rows must remain quarantined unless separately dispositioned |
| Backup/recovery tooling | Implemented | Actual production backup + isolated restore rehearsal must complete under #45 |
| Stable public contracts | Complete | Final release must preserve the frozen v1 compatibility contract |
| Canary | Pending execution | Monitored production canary must satisfy the release-cutover exit conditions |
| `v1.0.0` tag/release | Not created | Tag only after all final evidence is green |

## Risk Assessment

### Critical

- cross-tenant data leakage;
- incompatible or corrupting database migration;
- queue ownership/durability failure that can duplicate side effects;
- authentication/authorization bypass.

### High

- worker outage or sustained queue growth;
- tool execution errors that leave ambiguous workflow state;
- replay/checkpoint corruption;
- release evidence collected from different SHAs.

### Medium

- UI/dashboard refresh inconsistencies;
- realtime/load degradation;
- query/index inefficiencies;
- incomplete operator evidence for recovery objectives.

## Known External / Execution Dependencies

### #18 — GitHub Actions runner/billing lock

The release/security workflows are implemented, but hosted jobs currently cannot start because the GitHub account is locked by a billing issue. A failed-to-start job is not treated as a code failure, and it is also not treated as passing evidence.

### #33 — always-on production worker

Worker code, deployment configuration, queue cutoff fencing, and runbooks are ready. The selected Render background-worker resource requires paid compute, so actual hosting is intentionally deferred rather than replaced with a weaker architecture solely to avoid the infrastructure cost.

### #45 — backup and restore rehearsal

The repository can generate provider-independent logical backups, but the production backup and isolated restore rehearsal require trusted database credentials, off-site storage, and a disposable target. Until that rehearsal is executed and timed, Agent Workbench does not claim a proven production RPO/RTO.

## Go / No-Go Rule

**Current decision: NO-GO for tagging `v1.0.0`.**

This is an evidence decision, not a statement that the platform architecture is unfinished.

Move to GO only when one exact final release candidate SHA has:

1. green required hosted validation/security/integration/reliability/E2E evidence;
2. a successful production backup and verified isolated restore rehearsal;
3. a verified always-on worker cutover with healthy post-cutover queues;
4. a READY Vercel production deployment for that SHA;
5. successful production liveness/readiness and authenticated smoke checks;
6. a monitored canary that meets `docs/operations/release-cutover.md` exit conditions.

After those conditions pass, update the release version/docs, validate that final release commit as the release candidate, then create the `v1.0.0` tag and GitHub Release.
