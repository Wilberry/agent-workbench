# Quota Enforcement and Usage Accounting

## Overview

This document describes the production-grade quota enforcement and billing system for Agent Workbench. The system enforces organization-level run quotas before execution and maintains an append-only usage ledger for accurate billing analytics.

## Architecture

### Key Components

1. **Quota Validation** - Checks organization's remaining quota before enqueue
2. **Quota Reservation** - Records quota allocation when run is enqueued
3. **Usage Recording** - Records actual token usage and cost when run completes
4. **Usage Ledger** - Append-only audit trail for all quota and usage events
5. **Billing Metrics** - Derives aggregated billing data from ledger

## Quota Limits by Plan

| Plan | Run Limit | Token Limit | Monthly Cost |
|------|-----------|-------------|--------------|
| Free | 5 | Unlimited | $0 |
| Pro | 1,000 | Unlimited | $99 |
| Enterprise | Unlimited | Unlimited | Custom |

## Failure Handling Policy

**Policy: Reserved runs are consumed even if run fails.**

This policy is chosen because:
- Simplifies quota accounting
- Prevents abuse (failed runs don't refund quota)
- Aligns with billing model (failed compute still consumes resources)

If a run fails after being enqueued:
1. Quota reservation remains consumed
2. Event type `run_failed` is recorded with zero cost
3. Organization is not refunded quota

## Database Schema

### organization_usage_events Table

Append-only ledger for all quota and usage events.

```sql
CREATE TABLE organization_usage_events (
  id UUID PRIMARY KEY,
  organization_id UUID,
  run_id UUID,
  event_type TEXT, -- 'quota_reserved' | 'run_completed' | 'run_failed' | 'quota_refunded'
  tokens INTEGER,
  estimated_cost NUMERIC(12, 6),
  metadata JSONB,
  created_at TIMESTAMPTZ
);
```

**Event Types:**

- `quota_reserved` - Quota reserved when run is enqueued
- `run_completed` - Run completed with token usage recorded
- `run_failed` - Run failed (no refund per policy)
- `quota_refunded` - Reserved quota refunded (manual admin operation)

**Indexes:**

- `organization_id` - Fast lookup by org
- `run_id` - Track usage for specific run
- `event_type` - Filter by event type
- `organization_id, created_at` - Time-series analysis

## API Integration

### Quota Validation Flow

```
POST /api/agent/run
├─ Authenticate user
├─ Authorize execution (agent ownership, conversation access)
├─ Validate quota
│  └─ If failed: Return 403 with error response
├─ Save user message
├─ Enqueue agent run
├─ Reserve quota (idempotent)
└─ Return 202 with runId
```

### Error Response - Quota Exceeded

```json
{
  "error": "quota_exceeded",
  "message": "Organization has reached its run limit"
}
```

Status Code: `403 Forbidden`

## SDK Helpers

### validateQuota()

```typescript
await orgs.validateQuota(organizationId: string | null)
// Returns: { plan, reserved, quota }
// Throws: Error with code='QUOTA_EXCEEDED' if limit reached
```

### reserveQuota()

```typescript
const reservationId = await orgs.reserveQuota(
  organizationId,
  runId,
  { estimatedCost?: number }
);
// Idempotent: Safe to call multiple times per run
// Returns: Reservation UUID or null for personal runs
```

### recordRunUsage()

```typescript
await orgs.recordRunUsage(
  organizationId,
  runId,
  { tokens: number, estimatedCost: number }
);
// Idempotent: Safe to call multiple times per run
// Records run_completed event in ledger
```

### recordRunFailure()

```typescript
await orgs.recordRunFailure(
  organizationId,
  runId,
  { reason?: string }
);
// Idempotent: Safe to call multiple times per run
// Records run_failed event in ledger
// Per policy: Reservation is consumed, not refunded
```

### getBillingMetrics()

```typescript
const metrics = await orgs.getBillingMetrics(organizationId);
// Returns: { totalRuns, totalTokens, totalCost, completedRuns, failedRuns }
// Derives from organization_usage_events ledger
```

## Workflow

### Run Enqueue

1. **Authenticate** - Verify user identity
2. **Authorize** - Check agent ownership and conversation access
3. **Validate Quota** - Query current quota usage from ledger
   - If exceeded: Return 403 error
   - If within quota: Proceed
4. **Save Message** - Insert user message into messages table
5. **Enqueue Run** - Insert run into agent_runs and agent_run_jobs
6. **Reserve Quota** - Record `quota_reserved` event in usage ledger
7. **Return** - 202 Accepted with runId

### Run Completion

1. **Worker Process** - Background worker dequeues and executes run
2. **Collect Metrics** - Track tokens, cost, latency
3. **Mark Complete** - Update agent_runs status to 'completed'
4. **Record Usage** - Insert `run_completed` event with actual usage
5. **Broadcast Event** - Notify subscribers of completion

### Run Failure

1. **Catch Error** - Worker catches execution exception
2. **Mark Failed** - Update agent_runs status to 'failed' with error message
3. **Record Failure** - Insert `run_failed` event (no cost)
4. **Retry or Dead Letter** - Per retry policy
5. **Broadcast Event** - Notify subscribers of failure

## Billing Calculation

### Real-Time Metrics

Retrieve current usage for dashboard:

```sql
SELECT
  COALESCE(COUNT(DISTINCT run_id), 0) as total_runs,
  COALESCE(SUM(tokens), 0) as total_tokens,
  COALESCE(SUM(estimated_cost), 0) as total_cost
FROM organization_usage_events
WHERE organization_id = $1
  AND event_type IN ('run_completed', 'run_failed');
```

### Monthly Invoice

Count completed runs and sum costs for billing period:

```sql
SELECT
  DATE_TRUNC('month', created_at) as billing_month,
  COUNT(DISTINCT run_id) as run_count,
  SUM(estimated_cost) as total_cost
FROM organization_usage_events
WHERE organization_id = $1
  AND event_type = 'run_completed'
  AND created_at >= $2
  AND created_at < $3
GROUP BY billing_month;
```

## Testing

### Test Coverage

1. **Quota Validation**
   - Passes when under quota
   - Throws structured error when exceeded
   - Handles personal runs without quota

2. **Quota Reservation**
   - Reserves quota successfully
   - Tracks estimated cost
   - Idempotent (multiple calls don't create duplicates)

3. **Usage Recording**
   - Records usage on completion
   - Idempotent (handles duplicate completion events)
   - Filters only completed/failed runs

4. **Concurrent Safety**
   - Multiple simultaneous reservations are safe
   - No double-booking under quota limits

5. **API Route**
   - Returns 403 with quota_exceeded error when quota exceeded
   - Returns 202 with runId when successful
   - Reserves quota after successful enqueue

6. **Failure Handling**
   - Failed runs consume quota (not refunded)
   - Failure events recorded correctly
   - Idempotent failure recording

### Running Tests

```bash
pnpm test tests/security/quota-billing.spec.ts
pnpm test tests/security/quota-api-enforcement.spec.ts
```

## Idempotency

All quota and usage operations are idempotent:

- **reserveQuota** - Multiple calls for same runId create only one reservation
- **recordRunUsage** - Multiple calls for same runId record only one completion event
- **recordRunFailure** - Multiple calls for same runId record only one failure event

This is achieved by querying for existing events before inserting:

```typescript
const { data: existing } = await supabase
  .from('organization_usage_events')
  .select('id')
  .eq('organization_id', orgId)
  .eq('run_id', runId)
  .eq('event_type', 'run_completed')
  .maybeSingle();

if (existing) {
  return; // Already recorded
}
```

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Quota Exceeded Errors** - Track 403 error rate by plan
2. **Failed Reservation Rate** - Percentage of enqueues failing quota check
3. **Usage Recording Latency** - Time from run completion to usage recorded
4. **Ledger Growth Rate** - Rows added to usage_events per hour

### Alerts

- Alert if quota_exceeded errors > 5% for any plan
- Alert if usage_recording failures increase
- Alert if ledger queries exceed 1 second

## Migration

### From Legacy Billing to Usage Events

The migration from the legacy `org_billing` table to the new `organization_usage_events` ledger is gradual:

1. **During Transition**
   - `validateQuota()` falls back to `org_billing` if ledger unavailable
   - `getBillingMetrics()` falls back to agent_runs query if ledger unavailable
   - New events written to ledger, legacy table updated in parallel

2. **Post-Migration**
   - `org_billing.tokens_used` and `org_billing.runs_used` become read-only
   - All new queries use `organization_usage_events`
   - Legacy table retained for backwards compatibility

## Future Enhancements

1. **Quota Refunds** - Admin interface to record quota_refunded events
2. **Dynamic Pricing** - Token cost varies by model and region
3. **Usage Alerts** - Notify users when approaching quota limit
4. **Burst Capacity** - Allow temporary over-quota for Pro/Enterprise plans
5. **Cost Predictions** - Estimate cost before execution
6. **Budget Controls** - Set monthly spending limits per organization
