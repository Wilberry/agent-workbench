# SQL Query Library for Observability Dashboards

Ready-to-use parameterized queries for all dashboard analytics. All queries use `$1` for `org_id` parameter unless noted.

---

## 1. Run Success/Failure Rates

### Daily Status Distribution
```sql
SELECT 
  DATE(created_at) as date,
  status,
  COUNT(*) as count
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), status
ORDER BY date DESC, status;
```

### Overall Status Counts (Last 30 days)
```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM agent_runs 
    WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '30 days'), 2) as percentage
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC;
```

### Success Rate Trend (Hourly)
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2) as success_rate
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

---

## 2. Token Usage & Cost Analytics

### Daily Cost Breakdown
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as run_count,
  SUM(total_tokens) as total_tokens,
  ROUND(AVG(total_tokens), 2) as avg_tokens_per_run,
  ROUND(SUM(estimated_cost), 6) as daily_cost,
  ROUND(AVG(estimated_cost), 6) as avg_cost_per_run,
  ROUND(MAX(estimated_cost), 6) as max_run_cost
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
  AND status IN ('completed', 'failed')
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Hourly Token Usage
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as run_count,
  SUM(total_tokens) as hourly_tokens,
  ROUND(AVG(total_tokens), 0) as avg_tokens_per_run
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'
  AND total_tokens > 0
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

### Cumulative Cost Over Time
```sql
SELECT 
  DATE(created_at) as date,
  SUM(SUM(estimated_cost)) OVER (
    PARTITION BY organization_id 
    ORDER BY DATE(created_at) 
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) as cumulative_cost,
  SUM(estimated_cost) as daily_cost
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Cost by Status (Completed vs Failed)
```sql
SELECT 
  status,
  COUNT(*) as run_count,
  SUM(total_tokens) as total_tokens,
  ROUND(SUM(estimated_cost), 6) as total_cost,
  ROUND(AVG(estimated_cost), 6) as avg_cost
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
  AND status IN ('completed', 'failed')
GROUP BY status;
```

---

## 3. Model Performance Comparison

### Model Stats Comparison
```sql
SELECT 
  COALESCE(model_name, 'unknown') as model,
  COUNT(*) as run_count,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2) as success_rate,
  ROUND(AVG(total_tokens), 0) as avg_tokens,
  ROUND(AVG(latency_ms), 0) as avg_latency_ms,
  ROUND(AVG(estimated_cost), 6) as avg_cost_per_run,
  ROUND(MAX(estimated_cost), 6) as max_cost,
  MAX(created_at) as last_used
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY model_name
ORDER BY run_count DESC;
```

### Model Performance by Status
```sql
SELECT 
  COALESCE(model_name, 'unknown') as model,
  status,
  COUNT(*) as count,
  ROUND(AVG(latency_ms), 0) as avg_latency_ms,
  ROUND(AVG(total_tokens), 0) as avg_tokens
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY model_name, status
ORDER BY model_name, count DESC;
```

### Model Cost Efficiency (Cost per successful run)
```sql
SELECT 
  COALESCE(model_name, 'unknown') as model,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  ROUND(AVG(estimated_cost) FILTER (WHERE status = 'completed'), 6) as cost_per_success,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as failure_rate
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY model_name
HAVING COUNT(*) >= 10  -- Min sample size
ORDER BY cost_per_success DESC;
```

---

## 4. Tool Usage & Performance

### Tool Invocation Stats
```sql
SELECT 
  tool_name,
  COUNT(*) as invocations,
  COUNT(*) FILTER (WHERE status = 'success') as successful_calls,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) as success_rate,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
  ROUND(AVG(latency_ms), 0) as avg_latency_ms,
  ROUND(MAX(latency_ms), 0) as max_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) as p95_latency_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0) as p99_latency_ms
FROM tool_calls
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY tool_name
ORDER BY invocations DESC;
```

### Tool Failures Over Time
```sql
SELECT 
  DATE(created_at) as date,
  tool_name,
  COUNT(*) as invocations,
  COUNT(*) FILTER (WHERE status = 'failed') as failures,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as failure_rate
FROM tool_calls
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), tool_name
ORDER BY date DESC, failures DESC;
```

### Tool Latency Percentiles
```sql
SELECT 
  tool_name,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms), 0) as p50_ms,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency_ms), 0) as p75_ms,
  ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY latency_ms), 0) as p90_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) as p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0) as p99_ms
FROM tool_calls
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY tool_name
ORDER BY p95_ms DESC;
```

---

## 5. Error Pattern Analysis

### Top Errors by Frequency
```sql
SELECT 
  error_message,
  COUNT(*) as occurrence_count,
  COUNT(DISTINCT DATE(created_at)) as days_affected,
  MAX(created_at) as last_occurrence,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM agent_runs 
    WHERE organization_id = $1 AND status = 'failed' AND created_at >= NOW() - INTERVAL '30 days'), 2) as percentage
FROM agent_runs
WHERE organization_id = $1 
  AND status = 'failed'
  AND error_message IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY error_message
ORDER BY occurrence_count DESC
LIMIT 20;
```

### Error Trends Over Time
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / 
    (COUNT(*) FILTER (WHERE status = 'completed') + COUNT(*) FILTER (WHERE status = 'failed')), 2) as error_rate
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Retry Attempt Distribution
```sql
SELECT 
  status,
  attempts,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM agent_run_jobs), 2) as percentage
FROM agent_run_jobs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status, attempts
ORDER BY attempts DESC, status;
```

---

## 6. Evaluation Performance

### Agent Evaluation Summary
```sql
SELECT 
  av.id as version_id,
  ag.name as agent_name,
  COUNT(DISTINCT er.id) as evaluation_runs,
  COUNT(*) as total_examples,
  COUNT(*) FILTER (WHERE err.exact_match) as passed_examples,
  ROUND(100.0 * COUNT(*) FILTER (WHERE err.exact_match) / COUNT(*), 2) as pass_rate,
  MAX(er.created_at) as last_evaluated
FROM evaluation_runs er
JOIN evaluation_run_results err ON er.id = err.evaluation_run_id
JOIN agent_versions av ON er.agent_version_id = av.id
JOIN agents ag ON av.agent_id = ag.id
WHERE er.organization_id = $1
GROUP BY av.id, ag.name
ORDER BY evaluation_runs DESC;
```

### Evaluation Run Details
```sql
SELECT 
  er.id as run_id,
  ag.name as agent_name,
  ed.name as dataset_name,
  COUNT(*) as examples_count,
  COUNT(*) FILTER (WHERE err.exact_match) as passed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE err.exact_match) / COUNT(*), 2) as pass_rate,
  er.created_at,
  er.status
FROM evaluation_runs er
JOIN evaluation_run_results err ON er.id = err.evaluation_run_id
JOIN evaluation_datasets ed ON er.dataset_id = ed.id
JOIN agent_versions av ON er.agent_version_id = av.id
JOIN agents ag ON av.agent_id = ag.id
WHERE er.organization_id = $1
GROUP BY er.id, ag.name, ed.name, er.created_at, er.status
ORDER BY er.created_at DESC;
```

---

## 7. Run Performance Trends

### Hourly Performance Metrics
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as run_count,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2) as success_rate,
  ROUND(AVG(latency_ms), 0) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) as p95_latency_ms,
  ROUND(AVG(total_tokens), 0) as avg_tokens,
  ROUND(SUM(estimated_cost), 6) as hourly_cost
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

### Daily Aggregates
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'running') as running,
  ROUND(AVG(latency_ms) FILTER (WHERE status = 'completed'), 0) as avg_latency_completed,
  ROUND(AVG(latency_ms), 0) as overall_avg_latency,
  ROUND(SUM(total_tokens), 0) as daily_tokens,
  ROUND(SUM(estimated_cost), 6) as daily_cost
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 8. Usage Ledger (organization_usage_events)

### Event Type Distribution
```sql
SELECT 
  event_type,
  COUNT(*) as event_count,
  SUM(tokens) as total_tokens,
  ROUND(SUM(estimated_cost), 6) as total_cost
FROM organization_usage_events
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY event_type
ORDER BY total_cost DESC;
```

### Daily Event Breakdown
```sql
SELECT 
  DATE(created_at) as date,
  event_type,
  COUNT(*) as event_count,
  SUM(tokens) as tokens,
  ROUND(SUM(estimated_cost), 6) as cost
FROM organization_usage_events
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), event_type
ORDER BY date DESC, event_type;
```

### Quota Utilization
```sql
SELECT 
  'quota_reserved'::text as type,
  COUNT(*) as count,
  SUM(tokens) as tokens
FROM organization_usage_events
WHERE organization_id = $1
  AND event_type = 'quota_reserved'
UNION ALL
SELECT 
  'quota_refunded'::text,
  COUNT(*),
  SUM(tokens)
FROM organization_usage_events
WHERE organization_id = $1
  AND event_type = 'quota_refunded'
UNION ALL
SELECT 
  'net_reserved'::text,
  COUNT(*),
  SUM(CASE 
    WHEN event_type = 'quota_reserved' THEN tokens 
    WHEN event_type = 'quota_refunded' THEN -tokens
    ELSE 0 END)
FROM organization_usage_events
WHERE organization_id = $1
  AND event_type IN ('quota_reserved', 'quota_refunded');
```

---

## 9. Marketplace Adoption

### Public Agent Usage
```sql
SELECT 
  ma.id,
  ma.name,
  ma.slug,
  ma.description,
  COUNT(DISTINCT ar.id) as total_runs,
  COUNT(DISTINCT ar.user_id) as unique_users,
  MAX(ar.created_at) as last_run_date,
  ma.created_at as published_date
FROM marketplace_agents ma
LEFT JOIN agents a ON a.id = ma.id
LEFT JOIN agent_runs ar ON ar.agent_id = a.id
WHERE ma.visibility = 'public'
  AND ma.org_id != $1  -- Public (published by others)
GROUP BY ma.id, ma.name, ma.slug, ma.description, ma.created_at
ORDER BY total_runs DESC;
```

### Organization's Marketplace Performance
```sql
SELECT 
  ma.id,
  ma.name,
  ma.visibility,
  COUNT(DISTINCT ar.id) as total_runs,
  COUNT(DISTINCT ar.user_id) as unique_users,
  COUNT(DISTINCT ar.organization_id) as using_orgs,
  ma.created_at
FROM marketplace_agents ma
LEFT JOIN agents a ON a.id = ma.id
LEFT JOIN agent_runs ar ON ar.agent_id = a.id
WHERE ma.org_id = $1
GROUP BY ma.id, ma.name, ma.visibility, ma.created_at
ORDER BY total_runs DESC;
```

---

## 10. RPC Functions (Already Defined in Migrations)

### Get Organization Quota Usage
```sql
SELECT * FROM public.get_organization_quota_usage($1, 'quota_reserved');
```

Returns: `total_reserved`, `total_refunded`, `net_reserved`, `total_cost`

### Get Organization Billing Metrics
```sql
SELECT * FROM public.get_organization_billing_metrics($1);
```

Returns: `total_runs`, `total_tokens`, `total_cost`, `completed_runs`, `failed_runs`

---

## Implementation Notes

### Caching
- Aggregations over 7+ days: Cache 1-4 hours
- Recent trends (last 24h): Cache 5-15 minutes
- Real-time metrics (last 1h): Cache 1-2 minutes

### Indexes Already Present
✅ Fast:
- `idx_agent_runs_organization_id`
- `idx_agent_runs_created_at`
- `idx_agent_runs_status`
- `idx_tool_calls_organization_id`
- `idx_tool_calls_created_at`
- `idx_organization_usage_events_org_created`

### Suggested Additional Indexes (for performance)
```sql
CREATE INDEX idx_agent_runs_model_name ON agent_runs(organization_id, model_name, created_at DESC);
CREATE INDEX idx_agent_runs_status_created ON agent_runs(organization_id, status, created_at DESC);
CREATE INDEX idx_tool_calls_tool_name_created ON tool_calls(organization_id, tool_name, created_at DESC);
```

