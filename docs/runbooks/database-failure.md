# Runbook: Database Failure

## Detection

- Alert triggers when PostgreSQL connection errors increase
- Supabase health metrics show failed queries or RLS policy failures
- Application logs include database timeout or connection refused

## Diagnosis

1. Confirm the specific Supabase service impacted (database, auth, storage).
2. Check Supabase project status dashboard for incident reports.
3. Review recent schema migrations or configuration changes.
4. Use Supabase SQL editor to verify connectivity and query response.

## Mitigation

1. Fail fast in the runtime worker and mark active runs as failed if database writes cannot persist.
2. If read-only access remains available, pause new agent run submissions.
3. Restore from the latest verified backup if the database state is corrupted.
4. Engage Supabase support if the outage is within their managed service.

## Verification

- After recovery, run smoke tests against agent creation, conversation persistence, and agent run status.
- Validate that previously failed runs remain consistent and that new runs are accepted.
- Confirm no tenant data leakage occurred during recovery.
