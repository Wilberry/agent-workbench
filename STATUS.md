# Agent Workbench Engineering Status

> **Living status tracker**
>
> This file records implementation progress, release evidence, blockers, and the next engineering action. It may be updated as work progresses, but it must not redefine the canonical roadmap in [`ROADMAP.md`](./ROADMAP.md).

**Last verified:** 2026-09-08  
**Current release:** v0.4.0  
**Current engineering milestone:** v1.0 Production Release  
**Next planned milestone:** v1.1 MCP + Knowledge Platform  

## Status rules

- `ROADMAP.md` defines approved scope and milestone order.
- `STATUS.md` records what has actually been built, verified, blocked, or released.
- Updating completion state, evidence links, dates, blockers, and next actions is allowed as engineering progresses.
- Updating this tracker must not add, remove, rename, or reorder roadmap scope.
- Any proposed roadmap change must be approved by `@Wilberry` before `ROADMAP.md` is modified.
- Claims of completion should be evidence-backed where practical by a merged PR, commit, issue closure, test result, deployment, or production verification.

---

# Milestone summary

| Milestone | State | Notes |
| --- | --- | --- |
| v0.5 Runtime Stabilization | ✅ Complete | Runtime/configuration and contributor validation foundations shipped |
| v0.6 Async Evaluations | ✅ Complete | Durable evaluation/experiment queues, recovery, cancellation, progress |
| v0.7 Model Platform | ✅ Complete | Live multi-provider model layer, health, retry, pricing/catalog behavior |
| v0.8 Agent Tooling | ✅ Complete | Native tools, richer streaming, stronger workflow semantics |
| v0.9 Developer Platform | ✅ Complete | Public API auth, API keys, CLI, external SDK contract |
| v1.0 Production Release | 🔥 Current | Repository engineering largely complete; final production/release evidence remains |
| v1.1 MCP + Knowledge Platform | ⏸ Not started | Begins only after v1.0 release |
| v1.2 Evaluation Intelligence | ⏸ Not started | Follows v1.1 unless roadmap owner approves a change |
| v1.3 Platform Expansion | ⏸ Not started | Follows v1.2 unless roadmap owner approves a change |

---

# v1.0 Production Release

## Completed

- [x] Production web liveness/readiness endpoints
- [x] Repository-owned deployment smoke contract
- [x] Production queue observability
- [x] Queue-health thresholds and operator runbooks
- [x] Production worker supervisor
- [x] Graceful SIGTERM/SIGINT drain behavior
- [x] Safe queue-cutover fence using `AGENT_WORKBENCH_WORKER_NOT_BEFORE`
- [x] Historical pre-cutover backlog quarantine semantics
- [x] Durable agent/evaluation worker validation on isolated infrastructure
- [x] Coolify worker deployment contract validated against isolated test Supabase
- [x] Stable public API / SDK / CLI compatibility contract
- [x] Same-SHA release/security evidence infrastructure
- [x] Database logical backup tooling
- [x] Disaster-recovery and rollback runbook
- [x] Production backup executed and retained in encrypted off-site storage
- [x] Isolated PostgreSQL 17 / Supabase restore rehearsal
- [x] Restore parity verification for schema, migrations, RLS, constraints, representative data, Auth, and queue state
- [x] Restored staging liveness/readiness smoke
- [x] Authenticated tenant-isolation smoke on restored staging target
- [x] Recovery interval and recovery-point evidence recorded
- [x] Production-oriented public homepage and current production web deployment
- [x] Canonical roadmap and living status tracker established on `main`

## Remaining release gates

- [ ] Deploy one always-on production worker on dedicated production compute / VPS using the validated Coolify worker contract
- [ ] Configure production secrets and select a fresh exact UTC worker cutover timestamp immediately before first startup
- [ ] Verify production `worker_started` evidence and cutoff enforcement
- [ ] Process one fresh production-safe agent run after the cutoff
- [ ] Process one small production-safe evaluation after the cutoff
- [ ] Confirm historical pre-cutover queue rows remain untouched
- [ ] Verify production queue health, logs, monitoring, and graceful worker redeploy/restart behavior
- [ ] Close production worker cutover issue #33 with evidence
- [ ] Resolve GitHub-hosted Actions account/billing lock tracked in issue #18
- [ ] Run Validate, Security, Integration, Reliability, E2E, and release-evidence workflows on one exact release-candidate SHA
- [ ] Require green same-SHA hosted evidence
- [ ] Run monitored production canary window
- [ ] Stop release if queue growth, stale leases, security regressions, provider failures, or production health regressions appear
- [ ] Align release/version documentation
- [ ] Write final changelog and release notes
- [ ] Create `v1.0.0` Git tag
- [ ] Publish GitHub Release
- [ ] Close the v1.0 production-readiness plan with final evidence

## Current blockers

### #33 — Always-on production worker cutover

State: **Open / current engineering priority**

The worker implementation, cutoff safety, private Coolify validation, graceful restart behavior, and queue monitoring contract are ready. The remaining work is the production deployment and production-safe canary on dedicated always-on infrastructure.

Latest recheck on 2026-09-08 confirms only the validation/recovery laptop is currently connected through the available server-management surface. It remains validation-only and must not be promoted to production. A dedicated always-on VPS must be provisioned/connected before production secrets, cutoff selection, and canaries can be executed.

### #18 — GitHub-hosted Actions account/billing lock

State: **Open / external release blocker**

GitHub-hosted jobs have failed before workflow step execution because the account is locked due to a billing issue. This prevents trusted hosted same-SHA release evidence until the account-level problem is resolved.

Latest recheck on current `main` SHA `ae15dc12fdc9e4d607f26e4833a303ddd3830e0d`:

- Validate run `34169003547` failed with job `101885571014`, `steps: null`, and no retrievable logs.
- Security Validation run `34169003486` failed with job `101885571013`, `steps: null`, and no retrievable logs.
- This reproduces the existing pre-step runner failure and provides no application-code failure signal.

### #52 — Roadmap Code Owner enforcement

State: **Open / repository administration follow-up**

`ROADMAP.md` is owner-controlled and `.github/CODEOWNERS` assigns it to `@Wilberry`, but the repository currently reports no rulesets and the connected GitHub App cannot modify branch-protection administration. Enable a `main` ruleset requiring pull requests and Code Owner review to make the documented roadmap lock mechanically enforceable.

This governance follow-up does not change v1.0 feature scope and does not authorize any roadmap modification.

## Recently completed release evidence

### Disaster recovery rehearsal — complete

Issue #45 was closed on 2026-09-07 after production backup and isolated restore evidence was completed.

Verified evidence includes:

- production logical backup and SHA-256 manifest verification
- encrypted off-site retention
- isolated disposable self-hosted Supabase recovery target
- PostgreSQL 17.6 target
- `vector 0.8.0`
- migration history parity
- 26 public tables with 26/26 RLS enabled
- 62 RLS policies
- 113 constraints
- exact representative/Auth/public row-count parity checks
- restored staging `/api/health/live` and `/api/health/ready` success
- authenticated tenant-isolation smoke
- measured recovery interval and explicit backup recovery point

---

# Immediate engineering sequence

1. **Finish #33: production worker cutover.**
2. Verify production agent and evaluation canaries plus historical-backlog isolation.
3. Verify monitoring and graceful worker restart/redeploy behavior.
4. Resolve #18 and restore GitHub-hosted Actions execution.
5. Select one release-candidate SHA and freeze feature scope.
6. Produce green same-SHA release evidence.
7. Run the monitored production canary window.
8. Cut and publish `v1.0.0`.
9. Only after v1.0 is released, move `v1.1 MCP + Knowledge Platform` to current.

---

# v1.1 readiness

State: **Planned, not started**

Approved theme: **MCP + Knowledge Platform**.

Planned sequence is defined only in `ROADMAP.md`. No v1.1 implementation should displace unfinished v1.0 release gates unless explicitly authorized by the roadmap owner.

---

## Update history

### 2026-09-08

- Established `ROADMAP.md` as the canonical owner-controlled roadmap and `STATUS.md` as the living tracker via PR #51.
- Recorded DR rehearsal as complete following issue #45 closure.
- Rechecked current `main` hosted CI and confirmed #18 still fails before workflow steps on Validate and Security Validation.
- Rechecked connected hosts and confirmed no dedicated always-on production VPS is available yet; the laptop remains validation-only under #33.
- Opened #52 to track mechanical Code Owner enforcement for `ROADMAP.md` on `main`.
- Confirmed v1.0 remains the current milestone and v1.1 MCP + Knowledge Platform must not start before v1.0 release without owner approval.
