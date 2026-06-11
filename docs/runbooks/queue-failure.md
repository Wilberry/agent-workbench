# Runbook: Queue Failure

## Detection

- Jobs accumulate in the pending queue
- Agent run statuses remain pending
- Duplicate run records appear

## Diagnosis

1. Check the in-memory queue and worker state.
2. Review database `agent_runs` entries for pending and running status.
3. Confirm whether dequeue logic is executing or blocked.

## Mitigation

1. Restart the queue worker.
2. If the in-memory queue was lost, recover by re-enqueuing pending jobs from the database.
3. Deploy a durable queue implementation if the current in-memory queue proves unreliable.

## Verification

- Confirm pending runs transition to running or failed after recovery.
- Ensure duplicate jobs are not processed by verifying run IDs and trace ids.
- Validate the queue worker reports healthy state with regular heartbeats.
