# v1.0 Release Cutover Runbook

This runbook is the final operator sequence for turning one exact Agent Workbench commit into the `v1.0.0` platform release.

It does not replace the release-evidence workflow, worker runbook, queue-health runbook, or disaster-recovery runbook. It orders those contracts so the release has one source of operational truth.

## Release principle

A release candidate is one immutable 40-character Git commit SHA.

Do not collect CI evidence from one commit, deploy another, run a backup against a third, and tag a fourth. Every release artifact and production verification must either identify the same candidate SHA or explicitly record why an external resource is not commit-addressable.

## Hard prerequisites

Do not begin the final cutover until all of these are true:

- GitHub-hosted Actions can start jobs normally; issue #18 is resolved.
- The always-on production worker is deployed and verified; issue #33 is resolved.
- The database backup and isolated restore rehearsal is complete; issue #45 is resolved.
- No unresolved critical/high-severity security or data-integrity incident is active.
- `main` contains no unreviewed release-blocking change after the selected candidate.

If any prerequisite is false, stop. Do not compensate by weakening the release gate.

## 1. Select the release candidate

Choose the exact `main` commit to release and record:

```text
RELEASE_CANDIDATE_SHA=<40-character SHA>
RELEASE_VERSION=v1.0.0
```

Confirm the candidate is reachable from `main` and no later commit is intended for v1.0.

From this point, any code change creates a new candidate SHA and restarts release evidence.

## 2. Freeze migration state

Record the production Supabase migration head and compare it with the repository migrations expected by the candidate.

Required evidence:

- production project ref;
- latest production migration version/name;
- candidate SHA;
- confirmation that the candidate expects no unapplied production migration.

If a migration is still required, apply it under the normal migration procedure, verify it, and choose a new release candidate if the repository changed.

## 3. Create the pre-cutover production backup

Follow `docs/operations/disaster-recovery.md`.

Run the repository-owned logical backup command from a trusted operator environment:

```bash
pnpm ops:backup-db
```

Record, without exposing secrets:

```text
backup created_at
backup manifest SHA-256 evidence
source project ref
off-site retention location identifier
```

Do not continue if the backup is incomplete or has not been copied to durable off-site storage.

## 4. Verify worker cutover state

Follow `docs/operations/worker-deployment.md`.

Verify:

- worker is running the intended candidate-compatible code;
- `AGENT_WORKBENCH_WORKER_NOT_BEFORE` is configured;
- startup logs contain the expected cutover boundary;
- one post-cutover agent run has completed;
- one post-cutover evaluation has completed;
- pre-cutover historical queue rows remain untouched.

Then run queue health from a trusted operator environment with the same cutoff:

```bash
pnpm ops:queue-health
```

Release requires active post-cutover queues to be healthy. Historical `quarantined_pre_cutover` counts are evidence, not active-health failures.

## 5. Produce same-SHA hosted release evidence

The GitHub `Release Evidence` workflow accepts one input: `candidate_sha`.

First ensure the required workflows for the exact candidate SHA have completed successfully:

- Validate
- Security Validation
- Integration Test Suite
- Reliability Validation
- E2E Test Suite
- Vercel deployment/status

Then dispatch `Release Evidence` with the full candidate SHA.

Retain the generated artifact:

```text
release-evidence-<candidate_sha>/release-evidence.json
```

The release is blocked if any required same-SHA source is missing, pending, cancelled, skipped where success is required, or failed.

Do not substitute a Vercel build for the repository validation suite. Vercel is one release signal, not the canonical test gate.

## 6. Establish the rollback candidate

Before canary promotion, identify the last known-good production Vercel deployment and record its deployment ID/URL and Git SHA.

Verify that rolling the web application back to that deployment would remain schema-compatible with the current production database.

For database recovery, identify the pre-cutover backup from step 3. Web rollback and database restore are separate controls.

## 7. Promote/deploy the candidate

Deploy the selected candidate SHA to production through the normal Git-integrated Vercel path.

Verify the production deployment metadata reports the exact candidate SHA.

Do not tag `v1.0.0` yet.

## 8. Immediate production smoke

Run the repository deployment smoke contract against the production origin:

```bash
DEPLOYMENT_BASE_URL=<production-origin> pnpm smoke:deployment
```

Both endpoints must pass:

- `/api/health/live`
- `/api/health/ready`

Then perform authenticated smoke checks for the release-critical surfaces:

- sign in;
- organization-scoped agent discovery;
- one agent-run enqueue/observe/terminal flow;
- one evaluation enqueue/observe/terminal flow;
- trace/run visibility;
- organization isolation for the exercised data.

Use deliberately small production-safe inputs for the canary.

## 9. Canary observation

The canary is evidence collection, not idle waiting.

Minimum exit condition:

- at least 30 minutes of stable production observation;
- at least one successful post-release agent run;
- at least one successful post-release evaluation;
- no newly observed critical/high application error;
- no stale active queue lease;
- no sustained active pending-queue growth;
- no unexpected increase in terminal failures;
- no readiness failure;
- no tenant/security regression found by smoke verification.

If production traffic is too low to exercise the system meaningfully, extend the observation window or run additional controlled production-safe canaries. Time alone does not prove the runtime path.

Record:

```text
canary start/end
candidate SHA
production deployment ID
web readiness result
agent canary run ID
evaluation canary run ID
queue-health result
operator decision
```

## 10. Stop conditions and rollback

Stop the release immediately when a release-critical regression appears.

### Web regression with healthy data

- roll Vercel back to the recorded known-good deployment;
- rerun liveness/readiness;
- keep the database in place when schema compatibility is safe.

### Worker regression

- stop/disable worker claims;
- preserve queue state and logs;
- use checkpoint/retry/reclaim semantics rather than bulk queue mutation;
- redeploy the known-good worker before resuming.

### Data corruption or incompatible migration

Follow `docs/operations/disaster-recovery.md`.

Database restore is a last-resort recovery path and requires an explicit recovery-point decision. Do not improvise destructive down-migrations during an incident.

Any rollback ends the candidate. Fix forward on a new commit and restart the release process with a new SHA.

## 11. Cut the platform release

Only after the canary exit conditions pass:

1. update the root/platform version from the previous release to `1.0.0` in the release commit;
2. update README/current release status and the roadmap to mark v1.0 released;
3. write final changelog/release notes with the evidence links;
4. validate the release commit through the same required gates;
5. create the signed/annotated `v1.0.0` Git tag on the final release commit;
6. publish the GitHub Release from that tag.

The SDK and CLI versions remain independent package contracts. Do not automatically set them to `1.0.0` merely because the platform release is v1.0.

If the version/docs commit changes the candidate SHA, it becomes the final release candidate and needs same-SHA release evidence before tagging.

## 12. Close the release

Attach or link the final evidence to the v1.0 tracking issue:

- final Git SHA;
- Git tag;
- GitHub Release;
- `release-evidence.json` artifact/run;
- Vercel production deployment;
- production backup manifest timestamp;
- restore-rehearsal evidence/RTO measurement;
- worker cutover verification;
- queue-health result;
- canary evidence and operator decision.

Close #31 only when the platform is actually released or when remaining exceptions are explicitly accepted and documented. Do not close #18, #33, or #45 merely because their code paths exist.

## Current pre-cutover status

As of 2026-08-16, the repository-side v1.0 hardening is largely implemented, but the final release remains blocked by external/execution evidence:

- #18 — GitHub-hosted Actions account/billing lock;
- #33 — paid always-on worker hosting/cutover;
- #45 — actual production backup and isolated restore rehearsal.

Until those gates are cleared, `v1.0.0` must not be tagged.
