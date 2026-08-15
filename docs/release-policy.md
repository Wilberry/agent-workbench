# Release Policy

This document defines the Agent Workbench platform release contract for v1.0 and later release candidates. It is intentionally separate from package publishing policy.

## Version ownership

Agent Workbench currently has three version domains:

- repository/platform version in the root `package.json`
- `@agent-workbench/sdk` package version
- `@agent-workbench/cli` package version

The root version and Git tag represent the **platform release**. SDK and CLI versions are package contracts and may evolve independently.

A platform release does not automatically require the SDK or CLI package versions to match the root version. Do not synchronize package versions merely for cosmetic consistency.

Until a package-publishing workflow and policy are explicitly introduced, changes to SDK/CLI package versions should be intentional, reviewed package-release decisions rather than side effects of a platform tag.

## v1.0 tag policy

Do not create the `v1.0.0` platform tag or bump the root version to `1.0.0` until the exact candidate commit satisfies the release evidence contract and the final production cutover requirements.

The current pre-v1 root version remains valid while v1.0 hardening continues.

## Release candidate evidence

The repository-owned `Release Evidence` workflow evaluates one full 40-character candidate SHA. It does **not** re-run validation suites. Instead, it requires successful evidence already produced for that exact SHA.

Required workflow evidence:

- `Validate`
- `Security Validation`
- `Integration Test Suite`
- `Reliability Validation`
- `E2E Test Suite`

Required deployment evidence:

- Vercel commit status `success`

The evaluator writes `release-evidence.json` containing:

- schema version
- candidate SHA
- pass/fail status
- required workflow names
- observed workflow status/conclusion/run ID/link
- observed Vercel status/link
- deterministic failure reasons

A missing workflow run is a failure. A queued, in-progress, cancelled, skipped, timed-out, or failed required workflow is not release evidence. Vercel must report success for the same candidate commit.

## Security lifecycle

`Security Validation` runs on pushes to `main` and remains manually dispatchable. This gives every merged main commit a security-evidence opportunity while preserving an operator-triggered rerun path.

The security workflow remains separate from canonical hermetic validation because it uses production-style credentials and runs dependency/security checks that are intentionally not part of `pnpm validate`.

## GitHub Actions infrastructure blocker

Issue #18 currently prevents GitHub-hosted jobs from starting reliably. A workflow failure with no executed steps (`steps: null` / no logs) is infrastructure evidence, not application-code evidence.

The v1.0 platform release remains blocked until the release-evidence gate can actually execute and all required workflow results for the candidate SHA are successful. Local validation is necessary but does not substitute for the final hosted release evidence.

## Performance benchmarks

`Performance Benchmarks` remains manual and informational for this release slice. The repository does not yet define a stable performance threshold/SLO that would make a benchmark result an objective pass/fail release criterion.

Do not make performance a hard release gate until the expected thresholds, workload, environment, and regression policy are explicitly documented.

## Final production cutover requirements

Before tagging `v1.0.0`, all of the following must be true for the release candidate:

1. Production web liveness/readiness and deployment smoke contract are satisfied.
2. Queue observability is present and operator-readable.
3. The public `/api/v1` contract and compatibility policy are frozen and tested.
4. The production durable worker is deployed on always-on compute and verified against both agent and evaluation queues.
5. Historical pending queue rows have an explicit retention/execution decision before sustained worker consumption is enabled.
6. The exact candidate SHA has a passing `release-evidence.json` result.
7. No unresolved issue is explicitly marked as a v1.0 release blocker.

The paid Render worker deployment is intentionally deferred until final production cutover. Its absence before that point does not authorize replacing it with an unreliable free web-service workaround.

## Release procedure

For the final candidate:

1. Select the exact full commit SHA on `main`.
2. Confirm the required workflows have completed successfully for that SHA.
3. Confirm the Vercel deployment status is successful for that SHA.
4. Run the `Release Evidence` workflow with the exact candidate SHA.
5. Download and retain `release-evidence.json` with the release records.
6. Complete the production worker/backlog cutover checks.
7. Only after all required evidence is green, update the root platform version and create the corresponding platform tag/release.

Never tag a different commit from the one evaluated by the evidence gate.
