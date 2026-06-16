# Runbook: Deployment Rollback

## Detection

- New deployment causes failed agent runs or UI breakage
- Smoke tests fail after release
- Critical errors appear in production logs

## Diagnosis

1. Review deployment pipeline logs and current release version.
2. Confirm the specific changes included in the failed deployment.
3. Check whether database migrations were applied and whether those migrations are backward compatible.

## Mitigation

1. Roll back to the last successful deployment tag or commit.
2. If database migrations are incompatible, restore the database backup from before the deployment.
3. Redeploy the stable version and monitor for recovery.

## Verification

- Run smoke tests against the rolled-back release.
- Confirm user-facing flows are restored.
- Ensure no corrupted data remains from the failed deployment.
