# Agent Workbench Observability Audit

**Date**: 2026-06-22  
**Scope**: Existing observability data collection and immediate build opportunities

---

## 1. EXISTING DATA TABLES & FIELDS

### 1.1 `agent_runs` Table (Core Execution Tracking)
**Location**: [supabase/migrations/000006_agent_runs.sql](supabase/migrations/000006_agent_runs.sql) + [000012_observability.sql](supabase/migrations/000012_observability.sql)

**Fields Available**:
- `id` (UUID) - Run identifier
- `user_id` (UUID) - User who executed run
- `conversation_id` (UUID) - Parent conversation
- `organization_id` (UUID) - Organization scope (nullable, for per-user runs)
- `workflow` (JSONB) - List of workflow steps (e.g., ["Planner", "Executor", "Reviewer"])
- `current_step` (INTEGER) - Current workflow step index
- `execution_trace` (JSONB) - Array of step objects with metadata
- `status` (TEXT) - 'pending', 'running', 'completed', 'failed'
- `error_message` (TEXT) - Error if failed
- **Observability Fields**:
  - `input_tokens` (INTEGER) - Input token count
  - `output_tokens` (INTEGER) - Output token count
  - `total_tokens` (INTEGER) - Sum of input + output
  - `estimated_cost` (NUMERIC) - Estimated monetary cost
  - `latency_ms` (INTEGER) - Total execution latency
  - `model_name` (TEXT) - LLM model used
- **Replay Fields**:
  - `replay_of_run_id` (UUID) - Parent run if this is a replay
  - `is_replay` (BOOLEAN) - Flag for replay runs
  - `replay_reason` (TEXT) - Reason for replay
- `created_at`, `updated_at` (TIMESTAMP) - Timestamps

**Indexes**: user_id, conversation_id, status, created_at, organization_id

### 1.2 `execution_trace` Column (JSON Structure)
**Schema**: Each trace step contains:
```javascript
{
  metadata?: {
    toolName?: string,        // Tool executed
    tokens?: number,          // Tokens used in step
    latency?: number         // Step latency
  }
}
```

### 1.3 `tool_calls` Table (Tool Invocation Auditing)
**Location**: [supabase/migrations/000012_observability.sql](supabase/migrations/000012_observability.sql)

**Fields**:
- `id` (UUID) - Call identifier
- `run_id` (UUID) - Parent run
- `organization_id` (UUID) - Org scope
- `tool_name` (TEXT) - Tool identifier
- `status` (TEXT) - 'success' or 'failed'
- `latency_ms` (INTEGER) - Tool execution time
- `input_payload` (JSONB) - Input parameters
- `output_payload` (JSONB) - Tool output
- `created_at` (TIMESTAMP)

**Indexes**: run_id, organization_id, tool_name, created_at

### 1.4 `agent_run_events` Table (Event Stream)
**Location**: [supabase/migrations/000015_agent_run_events.sql](supabase/migrations/000015_agent_run_events.sql)

**Fields**:
- `id` (UUID)
- `run_id` (UUID) - Parent run
- `event_type` (TEXT) - Event classification
- `payload` (JSONB) - Event data
- `created_at` (TIMESTAMP)

**Indexes**: run_id, event_type, created_at

### 1.5 `organization_usage_events` Table (Append-Only Ledger)
**Location**: [supabase/migrations/000016_organization_usage_events.sql](supabase/migrations/000016_organization_usage_events.sql)

**Fields**:
- `id` (UUID)
- `organization_id` (UUID) - Org reference
- `run_id` (UUID) - Associated run (nullable)
- `event_type` (TEXT) - 'quota_reserved', 'run_completed', 'run_failed', 'quota_refunded'
- `tokens` (INTEGER) - Token delta
- `estimated_cost` (NUMERIC) - Cost delta
- `metadata` (JSONB) - Event context
- `created_at` (TIMESTAMP)

**Indexes**: org_id, run_id, event_type, created_at, (org_id, created_at DESC)

**Helper Functions Available**:
- `get_organization_quota_usage(org_id, event_type_filter='quota_reserved')` → Returns total_reserved, total_refunded, net_reserved, total_cost
- `get_organization_billing_metrics(org_id)` → Returns total_runs, total_tokens, total_cost, completed_runs, failed_runs

### 1.6 `evaluation_runs` Table
**Location**: [supabase/migrations/000018_evaluations.sql](supabase/migrations/000018_evaluations.sql)

**Fields**:
- `id` (UUID)
- `dataset_id` (UUID) - Dataset used
- `agent_version_id` (UUID) - Agent being evaluated
- `user_id` (UUID)
- `organization_id` (UUID) - Org scope
- `status` (TEXT) - 'pending', 'running', 'completed', 'failed'
- `summary` (JSONB) - Metrics object with:
  - `total_examples` (INTEGER)
  - `exact_match_count` (INTEGER)
  - `exact_match_rate` (FLOAT)
- `created_at`, `updated_at` (TIMESTAMP)

### 1.7 `evaluation_run_results` Table
**Fields**:
- `id` (UUID)
- `evaluation_run_id` (UUID) - Parent evaluation run
- `example_id` (UUID) - Dataset example
- `agent_output` (JSONB) - Agent response
- `exact_match` (BOOLEAN) - Pass/fail
- `details` (JSONB) - Comparison details
- `created_at` (TIMESTAMP)

### 1.8 `marketplace_agents` Table (Adoption Metrics)
**Location**: [supabase/migrations/000010_org_marketplace_billing.sql](supabase/migrations/000010_org_marketplace_billing.sql)

**Fields**:
- `id` (UUID)
- `org_id` (UUID) - Owner organization
- `name` (TEXT) - Agent name
- `slug` (TEXT) - URL-safe identifier
- `description` (TEXT)
- `visibility` (TEXT) - 'public' or 'private'
- `latest_version_id` (UUID) - Current version
- `created_at`, `updated_at` (TIMESTAMP)

### 1.9 `org_billing` Table (Legacy Quota)
**Fields**:
- `org_id` (UUID) - Primary key
- `plan` (TEXT) - 'free', 'pro', 'enterprise'
- `tokens_used` (BIGINT)
- `runs_used` (BIGINT)
- `last_billed` (TIMESTAMP)

### 1.10 `agent_run_jobs` Table (Queue/Retry Tracking)
**Location**: [supabase/migrations/000011_agent_run_queue.sql](supabase/migrations/000011_agent_run_queue.sql)

**Fields**:
- `id` (UUID)
- `run_id` (UUID) - Parent run
- `status` (TEXT) - 'pending', 'running', 'completed', 'failed'
- `attempts` (INTEGER) - Current attempt count
- `max_attempts` (INTEGER) - Max retries allowed
- `locked_at` (TIMESTAMP) - Lock timestamp
- `error_message` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

---

## 2. EXISTING SDK FUNCTIONS

### 2.1 `packages/sdk/src/agentRuns.ts`
**Location**: [packages/sdk/src/agentRuns.ts](packages/sdk/src/agentRuns.ts)

**Functions**:
- `enqueueRun(options: {userId, conversationId, workflow, orgId?, modelOverride?})` → Creates pending run
- `get(runId)` → Fetches single run
- `listByConversation(conversationId, limit?)` → User's runs in conversation
- `listByUser(userId, limit=50)` → User's recent runs
- `listOrgRuns(orgId, limit=50)` → Org's runs
- **TELEMETRY**: `orgTelemetry(orgId)` → Returns:
  ```javascript
  {
    total_runs: number,
    total_tokens: number,
    total_estimated_cost: number,
    average_latency_ms: number
  }
  ```
- `replay(runId)` → Gets run for replay
- `replayRun(originalRunId, options?)` → Creates replay run
- `subscribeToRunEvents(runId, callback)` → Realtime events

### 2.2 `packages/sdk/src/orgs.ts`
**Location**: [packages/sdk/src/orgs.ts](packages/sdk/src/orgs.ts)

**Query Functions**:
- `listUserOrgs(userId)` → User's organizations
- `getOrg(orgId)` → Organization details
- `listOrgAgents(orgId)` → Organization's agents
- `listOrgMarketplaceAgents(orgId)` → Marketplace listings
- `getBilling(orgId)` → Org billing status

**Usage Tracking**:
- `recordRunUsage(orgId, runIdOrOptions, usage?, client?)` → Records tokens/cost
- `checkQuota(orgId)` → Validates free plan limit (5 runs/month)
- `validateQuota(orgId)` → Returns `{plan, reserved, quota}`
- `reserveQuota(orgId, runId, options?)` → Pre-reserves quota
- `recordUsageOnCompletion(orgId, runId, usage)` → Idempotent usage record
- `recordRunFailure(orgId, runId, options?)` → Records failed runs
- `getBillingMetrics(orgId)` → Returns derived metrics from usage events

### 2.3 `packages/sdk/src/evaluations.ts`
**Location**: [packages/sdk/src/evaluations.ts](packages/sdk/src/evaluations.ts)

**Functions**:
- `createDataset(userId, payload)` → Create evaluation dataset
- `addDatasetExamples(datasetId, examples[])` → Add test cases
- `getDataset(datasetId)` → Fetch dataset
- `listDatasets(userId, options?)` → User's datasets
- `createEvaluationRun(userId, payload)` → Execute evaluation
- `getEvaluationRun(runId)` → Fetch evaluation run
- `getEvaluationResults(runId)` → Fetch all results for run

### 2.4 `packages/sdk/src/marketplace.ts`
**Location**: [packages/sdk/src/marketplace.ts](packages/sdk/src/marketplace.ts)

**Functions**:
- `listPublicAgentVersions(limit=50)` → Browse public agents
- `getAgentVersion(versionId)` → Get specific version details

---

## 3. EXISTING API ROUTES

**Location**: `apps/web/src/app/api/`

### Data Retrieval Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/agent/run/[runId]` | GET | Fetch run with events |
| `/agent/run/[runId]/replay` | GET/POST | Replay operation |
| `/agent/run` | POST | Enqueue new run |
| `/evaluations/runs/[runId]` | GET | Fetch evaluation run |
| `/evaluations/runs/[runId]/results` | GET | Fetch evaluation results |
| `/evaluations/runs` | GET/POST | List/create evaluation runs |
| `/org/[orgId]/agents` | GET | Org's agents |
| `/org/[orgId]/agents/[agentId]/publish` | POST | Publish agent |
| `/marketplace/agents` | GET | Browse marketplace |

### **NO DEDICATED ANALYTICS ROUTES EXIST YET**
- No cost analytics endpoint
- No usage summary endpoint
- No model performance endpoint
- No error pattern endpoint

---

## 4. EXISTING UI PAGES & DASHBOARDS

### 4.1 Run Tracking Pages
- **[apps/web/src/app/(authenticated)/runs/page.tsx](apps/web/src/app/(authenticated)/runs/page.tsx)** - Personal runs dashboard
  - Shows: Total/completed/running/pending/failed counts
  - Lists all user runs with status
  
- **[apps/web/src/app/(authenticated)/runs/[runId]/page.tsx](apps/web/src/app/(authenticated)/runs/[runId]/page.tsx)** - Run detail page
  - Shows: Execution timeline, status, workflow steps
  
- **[apps/web/src/app/(authenticated)/traces/page.tsx](apps/web/src/app/(authenticated)/traces/page.tsx)** - Trace explorer
  - Shows: Token counts, latency, tool names, model
  - Supports filtering by: status, tool used, search query
  - Displays: execution_trace metadata

### 4.2 Organization Pages
- **[apps/web/src/app/(authenticated)/orgs/page.tsx](apps/web/src/app/(authenticated)/orgs/page.tsx)** - Org listing
  
- **[apps/web/src/app/(authenticated)/orgs/[orgId]/page.tsx](apps/web/src/app/(authenticated)/orgs/[orgId]/page.tsx)** - Org overview
  - Uses: `OrgTraceAnalytics` component
  - Shows: Total runs, avg steps, total tokens, estimated cost, avg latency
  
- **[apps/web/src/app/(authenticated)/orgs/[orgId]/traces/page.tsx](apps/web/src/app/(authenticated)/orgs/[orgId]/traces/page.tsx)** - Org trace explorer
  - Lists: Recent traces with step count, token count, tools used
  - Shows: Organization trace analytics dashboard
  
- **[apps/web/src/app/(authenticated)/orgs/[orgId]/billing/page.tsx](apps/web/src/app/(authenticated)/orgs/[orgId]/billing/page.tsx)** - Billing view
  - Shows: Plan, tokens used, estimated spend, runs executed
  - Uses: `agentRuns.orgTelemetry()` function
  
- **[apps/web/src/app/(authenticated)/orgs/[orgId]/marketplace/page.tsx](apps/web/src/app/(authenticated)/orgs/[orgId]/marketplace/page.tsx)** - Marketplace

### 4.3 Evaluation Pages
- **[apps/web/src/app/(authenticated)/evaluations/page.tsx](apps/web/src/app/(authenticated)/evaluations/page.tsx)** - Evaluation dashboard
  - Shows: Dataset count, recent runs, success rate, failure rate
  - Lists: Recent datasets with example counts
  - Lists: Recent evaluation runs with pass/fail counts
  
- **[apps/web/src/app/(authenticated)/evaluations/datasets/page.tsx](apps/web/src/app/(authenticated)/evaluations/datasets/page.tsx)** - Dataset listing
  
- **[apps/web/src/app/(authenticated)/evaluations/runs/page.tsx](apps/web/src/app/(authenticated)/evaluations/runs/page.tsx)** - Evaluation run listing
  
- **[apps/web/src/app/(authenticated)/evaluations/compare/page.tsx](apps/web/src/app/(authenticated)/evaluations/compare/page.tsx)** - Comparison view

---

## 5. EXISTING COMPONENTS

### Analytics & Display Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `OrgTraceAnalytics` | [apps/web/src/components/OrgTraceAnalytics.tsx](apps/web/src/components/OrgTraceAnalytics.tsx) | **Only existing analytics component** - Shows metrics cards (total runs, avg steps, total tokens, estimated cost, avg latency), trace length chart, status breakdown |
| `ExecutionTraceTimeline` | [apps/web/src/components/ExecutionTraceTimeline.tsx](apps/web/src/components/ExecutionTraceTimeline.tsx) | Visualizes execution steps |
| `EvaluationRunSummaryCard` | [apps/web/src/components/evaluations/EvaluationRunSummaryCard.tsx](apps/web/src/components/evaluations/EvaluationRunSummaryCard.tsx) | Summary metric display |
| `EvaluationStatusBadge` | [apps/web/src/components/evaluations/EvaluationStatusBadge.tsx](apps/web/src/components/evaluations/EvaluationStatusBadge.tsx) | Status indicator |
| `EvaluationResultsTable` | [apps/web/src/components/evaluations/EvaluationResultsTable.tsx](apps/web/src/components/evaluations/EvaluationResultsTable.tsx) | Tabular results display |
| `EvaluationComparisonCard` | [apps/web/src/components/evaluations/EvaluationComparisonCard.tsx](apps/web/src/components/evaluations/EvaluationComparisonCard.tsx) | Run comparison |

### **NO EXISTING CHART LIBRARIES INTEGRATED**
- No recharts, victory, or visx used for analytics
- Only basic HTML/CSS cards and progress bars

---

## 6. WHAT'S READY TO BUILD IMMEDIATELY

All items below require **NO new database schema** - only API routes, queries, and UI.

### 6.1 Run Success/Failure Rates Dashboard

**Data Source**: `agent_runs.status`

**Query Pattern**:
```sql
SELECT 
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*) as success_rate
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY status;
```

**Fields Available**: status, created_at, organization_id

**API Route Needed**: YES
- `GET /api/org/[orgId]/analytics/run-stats` - Returns daily success rates, status counts

**Component Complexity**: MEDIUM
- Bar chart (Recharts): Status distribution
- Time series: Success rate over time
- KPI cards: Total runs, success %, failure %

**Estimated Build Time**: 2-3 hours
- Create API route to aggregate status
- Build chart component
- Add to org dashboard

---

### 6.2 Token Usage & Cost Analytics

**Data Source**: 
- `agent_runs.{total_tokens, estimated_cost, latency_ms}`
- `organization_usage_events.{tokens, estimated_cost}` (ledger)

**Query Pattern**:
```sql
-- Per run breakdown
SELECT 
  DATE(created_at) as date,
  COUNT(*) as run_count,
  SUM(total_tokens) as total_tokens,
  AVG(total_tokens) as avg_tokens_per_run,
  SUM(estimated_cost) as daily_cost,
  MAX(estimated_cost) as max_run_cost
FROM agent_runs
WHERE organization_id = $1
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Or use ledger
SELECT 
  DATE(created_at) as date,
  SUM(tokens) as daily_tokens,
  SUM(estimated_cost) as daily_cost
FROM organization_usage_events
WHERE organization_id = $1 AND event_type IN ('run_completed', 'run_failed')
GROUP BY DATE(created_at);
```

**Fields Available**: total_tokens, estimated_cost, latency_ms, model_name

**API Route Needed**: YES
- `GET /api/org/[orgId]/analytics/usage` - Returns daily token/cost trends

**Component Complexity**: MEDIUM
- Line chart: Cost over time
- Bar chart: Tokens by run
- Pie chart: Cost distribution by model
- KPI: Total cost, avg cost/run

**Estimated Build Time**: 2-3 hours

---

### 6.3 Model Performance Comparison

**Data Source**: 
- `agent_runs.{model_name, status, total_tokens, latency_ms, estimated_cost}`
- `tool_calls.latency_ms` (breakdown by tool)

**Query Pattern**:
```sql
SELECT 
  model_name,
  COUNT(*) as run_count,
  COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*) as success_rate,
  AVG(total_tokens) as avg_tokens,
  AVG(latency_ms) as avg_latency_ms,
  AVG(estimated_cost) as avg_cost_per_run
FROM agent_runs
WHERE organization_id = $1
GROUP BY model_name
ORDER BY avg_cost_per_run DESC;
```

**Fields Available**: model_name, status, total_tokens, latency_ms, estimated_cost

**API Route Needed**: YES
- `GET /api/org/[orgId]/analytics/model-performance`

**Component Complexity**: MEDIUM
- Table: Model comparison (success %, tokens, latency, cost)
- Radar chart: Multi-metric comparison
- Scatter plot: Cost vs. success rate

**Estimated Build Time**: 2-3 hours

---

### 6.4 Tool Usage & Performance Analytics

**Data Source**: `tool_calls.{tool_name, status, latency_ms}`

**Query Pattern**:
```sql
SELECT 
  tc.tool_name,
  COUNT(*) as invocations,
  COUNT(*) FILTER (WHERE tc.status = 'success')::float / COUNT(*) as success_rate,
  AVG(tc.latency_ms) as avg_latency_ms,
  MAX(tc.latency_ms) as max_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tc.latency_ms) as p95_latency_ms
FROM tool_calls tc
WHERE tc.organization_id = $1
  AND tc.created_at >= NOW() - INTERVAL '30 days'
GROUP BY tc.tool_name
ORDER BY invocations DESC;
```

**Fields Available**: tool_name, status, latency_ms, created_at, organization_id

**API Route Needed**: YES
- `GET /api/org/[orgId]/analytics/tool-stats`

**Component Complexity**: MEDIUM
- Bar chart: Tool usage count
- Table: Tool success rate, latency stats
- Heatmap: Tool failures over time

**Estimated Build Time**: 2-3 hours

---

### 6.5 Organization Usage Ledger View

**Data Source**: `organization_usage_events.{event_type, tokens, estimated_cost, metadata}`

**Query Pattern**:
```sql
SELECT 
  DATE(created_at) as date,
  event_type,
  COUNT(*) as event_count,
  SUM(tokens) as tokens,
  SUM(estimated_cost) as cost
FROM organization_usage_events
WHERE organization_id = $1
GROUP BY DATE(created_at), event_type
ORDER BY date DESC;
```

**Fields Available**: event_type (quota_reserved, run_completed, run_failed, quota_refunded), tokens, estimated_cost, metadata

**API Route Needed**: YES (minor - can reuse existing query)
- `GET /api/org/[orgId]/analytics/usage-ledger`

**Component Complexity**: LOW
- Table: Event log with filters
- Pie chart: Event type breakdown
- Time series: Cumulative cost/tokens

**Estimated Build Time**: 1-2 hours

---

### 6.6 Error Pattern Analysis

**Data Source**:
- `agent_runs.{status, error_message}` 
- `agent_run_jobs.{status, error_message, attempts}`
- `tool_calls.{status, output_payload}` (failed calls)

**Query Pattern**:
```sql
-- Top errors
SELECT 
  error_message,
  COUNT(*) as occurrence_count,
  COUNT(*) FILTER (WHERE status = 'failed')::float / COUNT(*) as failure_rate
FROM agent_runs
WHERE organization_id = $1 
  AND status = 'failed'
  AND error_message IS NOT NULL
GROUP BY error_message
ORDER BY occurrence_count DESC
LIMIT 20;

-- Retry patterns
SELECT 
  status,
  attempts,
  COUNT(*) as count,
  AVG(attempts) as avg_attempts
FROM agent_run_jobs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status, attempts;
```

**Fields Available**: error_message, status, attempts, output_payload

**API Route Needed**: YES
- `GET /api/org/[orgId]/analytics/errors`

**Component Complexity**: MEDIUM
- Table: Error frequency
- Funnel: Error rates by workflow step
- Badge cloud: Common error messages
- Histogram: Retry attempt distribution

**Estimated Build Time**: 2-3 hours

---

### 6.7 Evaluation Performance Dashboard

**Data Source**: `evaluation_run_results.{exact_match, details}` + `evaluation_runs.{summary, agent_version_id}`

**Query Pattern**:
```sql
-- Aggregate by agent
SELECT 
  av.id,
  COUNT(DISTINCT er.id) as evaluation_run_count,
  COUNT(DISTINCT CASE WHEN err.exact_match THEN err.id END)::float / COUNT(*) as exact_match_rate,
  COUNT(*) as total_examples
FROM evaluation_runs er
JOIN evaluation_run_results err ON er.id = err.evaluation_run_id
JOIN agent_versions av ON er.agent_version_id = av.id
WHERE er.organization_id = $1
GROUP BY av.id;
```

**Fields Available**: exact_match, details, agent_version_id, summary

**API Route Needed**: YES (minor)
- `GET /api/org/[orgId]/analytics/eval-performance`

**Component Complexity**: LOW
- Table: Agent comparison with success rates
- KPI cards: Overall eval metrics
- Trend: Eval success over time

**Estimated Build Time**: 1-2 hours

---

### 6.8 Marketplace Agent Adoption Metrics

**Data Source**: 
- `marketplace_agents.{id, visibility, created_at}`
- `agent_runs` (filtered by agent_id)
- `agent_versions` (version count)

**Query Pattern**:
```sql
-- Adoption stats
SELECT 
  ma.id,
  ma.name,
  ma.visibility,
  COUNT(DISTINCT ar.id) as total_runs,
  COUNT(DISTINCT ar.user_id) as unique_users,
  DATE(ma.created_at) as published_date
FROM marketplace_agents ma
LEFT JOIN agents a ON a.id = ma.id  -- Join assumption may vary
LEFT JOIN agent_runs ar ON ar.agent_id = a.id
WHERE ma.visibility = 'public'
GROUP BY ma.id, ma.name, ma.visibility, ma.created_at;
```

**Fields Available**: visibility, created_at, name, description

**API Route Needed**: YES
- `GET /api/analytics/marketplace-adoption`

**Component Complexity**: LOW
- Table: Public agents with run counts
- Bar chart: Adoption by visibility
- KPI: Public vs private, total users

**Estimated Build Time**: 1-2 hours

---

### 6.9 Run Performance Over Time (Trend Analysis)

**Data Source**: 
- `agent_runs.{status, latency_ms, total_tokens, created_at}`

**Query Pattern**:
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as run_count,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
  AVG(latency_ms) as avg_latency_ms,
  AVG(total_tokens) as avg_tokens,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency
FROM agent_runs
WHERE organization_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

**Fields Available**: status, latency_ms, total_tokens, created_at

**API Route Needed**: YES
- `GET /api/org/[orgId]/analytics/performance-trends?interval=hour|day|week`

**Component Complexity**: MEDIUM
- Multi-line chart: Latency, token count, success rate trends
- Area chart: Run volume over time
- Heatmap: Performance by hour/day

**Estimated Build Time**: 2-3 hours

---

## 7. BUILD PRIORITY & SEQUENCE

### **Phase 1 (Highest Value, 2-3 days)**
1. **Token Usage & Cost Analytics** (2-3 hrs) - Core business metric
2. **Run Success/Failure Rates** (2-3 hrs) - Essential for monitoring
3. **Model Performance Comparison** (2-3 hrs) - ROI tracking
4. **Error Pattern Analysis** (2-3 hrs) - Ops visibility

### **Phase 2 (Supporting, 1-2 days)**
5. **Tool Usage Analytics** (2-3 hrs) - Dependency tracking
6. **Run Performance Trends** (2-3 hrs) - Historical analysis
7. **Evaluation Performance** (1-2 hrs) - Quality tracking
8. **Usage Ledger View** (1-2 hrs) - Audit trail

### **Phase 3 (Nice-to-Have, 1 day)**
9. **Marketplace Adoption Metrics** (1-2 hrs) - Commercial insights

---

## 8. IMPLEMENTATION CHECKLIST

### For Each Dashboard:
- [ ] Create API route: `GET /api/org/[orgId]/analytics/{dashboard}`
- [ ] Write SQL query with org scoping
- [ ] Add Recharts dependency (if not already present)
- [ ] Build React component with chart + table
- [ ] Add to org analytics page (new sidebar link)
- [ ] Add filters: date range, status, model, tool name (as applicable)
- [ ] Test with sample data
- [ ] Add cache headers (30-60s cache for aggregations)

---

## 9. DATA QUALITY NOTES

### Field Integrity
✅ **Reliable**:
- `status` - Indexed, enforced enum
- `total_tokens` - From LLM API
- `created_at` - Database timestamp
- `organization_id` - Foreign key

⚠️ **May Have Gaps**:
- `model_name` - Optional field, older runs may be NULL
- `error_message` - Only populated on failure
- `execution_trace` - Structure varies by agent version

### Missing Instrumentation
- **No request latency breakdown** (only total `latency_ms`)
- **No queue wait time** (only job status, not timing)
- **No cache hit rates** (not tracked)
- **No cost model details** (only final `estimated_cost`)

---

## 10. RECOMMENDED NEXT STEPS

1. **Immediate**: Build Phase 1 dashboards (all show value with existing data)
2. **Week 2**: Add export/CSV download to Phase 1 dashboards
3. **Week 3**: Implement alerts on Phase 2 dashboards (Slack webhook)
4. **Month 2**: Consider adding SLO/performance baseline tracking

