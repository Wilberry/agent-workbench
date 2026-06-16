# Runbook: Worker Failure

## Detection

- Alerts show background worker errors in logs
- Agent runs remain in pending state without progress
- Realtime updates stop firing for active workflows

## Diagnosis

1. Review worker logs for stack traces, retry failures, or environment variable issues.
2. Confirm whether the worker process crashed or became unresponsive.
3. Check job queue state in Supabase and local in-memory queue metrics.

## Mitigation

1. Restart the worker process immediately.
2. Confirm `OPENAI_API_KEY` and Supabase service role credentials are valid.
3. If the worker process crashed due to code changes, roll back deployment to the last known good version.
4. Re-enqueue affected runs using the SDK or API if required.

## Verification

- Verify pending runs resume processing after worker restart.
- Confirm realtime execution events resume and run status transitions to completed or failed.
- Validate that no duplicate run results were created.
