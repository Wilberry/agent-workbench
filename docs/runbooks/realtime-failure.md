# Runbook: Realtime Failure

## Detection

- Realtime event broadcasts stop delivering
- Client subscriptions no longer receive `execution_step` or `run_completed` events
- Dashboard or chat UI stalls while waiting for updates

## Diagnosis

1. Verify Supabase Realtime service status.
2. Check whether the channel subscription is active on the client side.
3. Confirm broadcast API calls from the worker are succeeding.

## Mitigation

1. Restart the worker and web application components.
2. If Supabase realtime is degraded, switch to polling as a temporary fallback.
3. Ensure broadcast payloads are valid and channels are correctly named.

## Verification

- Confirm realtime subscription recovers and receives new run events.
- Validate UI updates in chat and run detail pages.
- Check that event timestamps match recent activity.
