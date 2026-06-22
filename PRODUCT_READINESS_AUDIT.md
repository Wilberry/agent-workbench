# Agent Workbench - Product Readiness Audit
## Gap Analysis: Backend Capabilities → User-Facing Experience

**Date:** June 22, 2026  
**Focus:** Turning existing backend data into polished product experience  
**Scope:** NO new database tables, only UI/API layers  
**Status:** 9 dashboards ready to build, all data exists

---

## Executive Summary

Agent Workbench has **excellent observability infrastructure** but lacks **user-facing dashboards** to leverage it. The platform is collecting rich telemetry (tokens, costs, latency, errors, tool calls, usage events) but users have no centralized way to understand platform performance, costs, or usage patterns.

### Gap Analysis

| Capability | Backend Status | Frontend Status | Gap | Build Time |
|-----------|----------------|-----------------|-----|-----------|
| Token tracking | ✅ Collected in agent_runs | ❌ No dashboard | Display only | 2-3 hrs |
| Cost analytics | ✅ Stored in agent_runs.estimated_cost | ❌ No dashboard | Display only | 2-3 hrs |
| Success rates | ✅ Tracked in agent_runs.status | ❌ No aggregation | Display only | 2-3 hrs |
| Model performance | ✅ In execution_trace | ❌ No comparison | Display only | 2-3 hrs |
| Error patterns | ✅ Stored in agent_runs.error_message | ❌ No grouping | Display only | 2-3 hrs |
| Tool usage | ✅ In tool_calls table | ❌ No dashboard | Display only | 2-3 hrs |
| Eval results | ✅ In evaluation_run_results | ⚠️ Basic display | Limited filtering | 1-2 hrs |
| Org billing | ✅ In organization_usage_events | ⚠️ No dashboard | Display only | 1-2 hrs |
| Marketplace adoption | ✅ Run count tracked | ❌ No visibility | Display only | 1-2 hrs |

**Total Build Time:** 14-21 hours of engineering work

---

## Part 1: Data Inventory (What Exists)

### 1.1 Core Observability Tables

#### `agent_runs` (25+ fields)
```
id, user_id, organization_id, conversation_id, 
status, created_at, updated_at,
[TOKENS] input_tokens, output_tokens, total_tokens,
[COST] estimated_cost,
[PERFORMANCE] latency_ms, model_name,
[DEBUG] error_message, error_type,
[REPLAY] is_replay, replay_of_run_id,
execution_trace (JSONB), workflow (JSONB), current_step
```
**Indexes:** user_id, organization_id, created_at, status  
**Row Count:** ~100k+ per organization (production scale)  
**Aggregation Ready:** Yes - can group by date, model, status, org

#### `execution_trace` (JSONB)
```
[
  {
    role: "Planner|Executor|Reviewer",
    input: {...},
    output: {...},
    metadata: {
      toolName: string,
      tokens: number,
      latency: number,
      modelUsed: string
    }
  },
  ...
]
```
**Details:** Per-step breakdown of multi-agent workflow  
**Queryable:** No direct SQL query, must parse JSONB in app code  

#### `tool_calls` (Tool Invocation Tracking)
```
id, run_id, organization_id,
tool_name, status, latency_ms,
input_payload (JSONB), output_payload (JSONB),
created_at
```
**Indexes:** run_id, tool_name, organization_id, created_at  
**Purpose:** Track tool usage patterns and performance

#### `agent_run_events` (Event Stream)
```
id, run_id, organization_id,
event_type, payload (JSONB),
created_at
```
**Event Types:** run_started, run_completed, tool_executed, error_occurred  
**Purpose:** Audit trail and troubleshooting

#### `organization_usage_events` (Append-Only Ledger)
```
id, organization_id, run_id,
event_type, tokens, estimated_cost,
metadata (JSONB), created_at
```
**Event Types:** quota_reserved, quota_refunded, run_completed, run_failed  
**Purpose:** Immutable billing ledger for auditing  
**Helper RPC:** `get_organization_billing_metrics(org_id)` → {total_runs, total_tokens, total_cost, completed_runs, failed_runs}

#### `evaluation_run_results` (Test Results)
```
id, run_id, organization_id, dataset_id,
example_id, predicted_output, exact_match,
created_at
```
**Purpose:** Track evaluation accuracy per example  
**Aggregation:** Pass rate, improvement rate, regression detection

### 1.2 Existing SDK Functions (Ready to Use)

#### `packages/sdk/src/runs.ts`
```typescript
// Already exported:
export async function getRun(runId: string, client: SupabaseClient)
export async function listRuns(userId: string, options: {limit, offset, status}, client)
export async function getRunsByOrganization(orgId: string, options, client)
export async function getRun(runId: string, client: SupabaseClient)

// Partially implemented:
export async function getRunStats(runId: string, client) // Returns just tokens/cost
```
**Issue:** No aggregation functions (daily cost, trend analysis, model comparison)

#### `packages/sdk/src/orgs.ts`
```typescript
// Already available:
export async function checkQuota(orgId, client) // Returns {reserved, limit, remaining}
export async function getBilling(orgId, client)  // Returns org_billing row

// Via RPC (raw SQL wrapper):
export async function orgTelemetry(orgId, client)  
// Returns: { total_runs, total_tokens, avg_latency_ms, estimated_cost, completed_runs, failed_runs }
```
**Status:** `orgTelemetry()` exists and is the foundation for all dashboards

#### `packages/sdk/src/evaluations.ts`
```typescript
export async function getEvaluationResults(runId, client)  // Returns paginated results
export async function getEvaluationRun(runId, client)      // Returns run metadata + stats
```

### 1.3 Existing API Routes (15 Total)

**GET routes that support dashboards:**
- ✅ `GET /api/agent/run` - List user's runs
- ⚠️ `GET /api/agent/run/[runId]` - Single run (no aggregation)
- ✅ `GET /api/org/[orgId]/agents` - Org agents
- ⚠️ `GET /api/conversations/[conversationId]/messages` - Messages
- ⚠️ `GET /api/evaluations/runs` - Evaluation runs
- ⚠️ `GET /api/evaluations/runs/[runId]/results` - Eval results

**Missing for dashboards:**
- ❌ `GET /api/observability/summary` - Org-wide metrics
- ❌ `GET /api/observability/daily-costs` - Cost trends
- ❌ `GET /api/observability/model-stats` - Model performance
- ❌ `GET /api/observability/error-analysis` - Error grouping
- ❌ `GET /api/observability/tool-usage` - Tool statistics
- ❌ `GET /api/observability/eval-metrics` - Evaluation stats
- ❌ `GET /api/observability/usage-ledger` - Billing ledger

---

## Part 2: What Can Be Built Immediately (9 Dashboards)

### 2.1 Dashboard 1: Overview (5 metric cards + chart)
**Purpose:** At-a-glance org health  
**Data Sources:** agent_runs, organization_usage_events  
**No New Tables:** ✅

**Metrics to Display:**
1. Total runs (last 30 days) - `COUNT(agent_runs)` filter by org + date
2. Success rate % - `COUNT(status='completed') / COUNT(*)`
3. Total tokens - `SUM(total_tokens)`
4. Estimated cost - `SUM(estimated_cost)`
5. Avg latency - `AVG(latency_ms)`

**SQL Complexity:** Medium (group by, aggregation)  
**API Route Needed:** `GET /api/observability/summary` (15 min)  
**Component:** 5 metric cards + 1 line chart (success rate trend)  
**Build Time:** 2-3 hours (including API)

---

### 2.2 Dashboard 2: Daily Cost Analytics (Trending + Breakdown)
**Purpose:** Understand spending patterns and forecast  
**Data Sources:** agent_runs (estimated_cost per run)  
**No New Tables:** ✅

**Charts:**
1. Cost trend line chart (daily, last 30 days)
2. Cost breakdown by agent (pie chart)
3. Cost breakdown by model (bar chart)
4. Cost per run distribution (histogram)

**SQL Complexity:** Medium  
**API Route Needed:** `GET /api/observability/daily-costs` (15 min)  
**Components:** LineChart, PieChart, BarChart  
**Build Time:** 2-3 hours (chart library integration + data)

---

### 2.3 Dashboard 3: Success Rate & Failure Analysis
**Purpose:** Identify reliability issues  
**Data Sources:** agent_runs.status, error_message, tool_calls  
**No New Tables:** ✅

**Charts:**
1. Status distribution pie chart (pending, running, completed, failed)
2. Success rate trend (hourly/daily)
3. Top errors table (grouped, with counts)
4. Retry rates by error type

**SQL Complexity:** Medium-High  
**API Route Needed:** `GET /api/observability/failure-analysis` (20 min)  
**Components:** PieChart, LineChart, Table  
**Build Time:** 3-4 hours

---

### 2.4 Dashboard 4: Model Performance Comparison
**Purpose:** Compare LLM efficiency (cost, speed, accuracy)  
**Data Sources:** agent_runs.model_name, latency, cost, status  
**No New Tables:** ✅

**Comparisons:**
1. Model success rate (%)
2. Avg tokens per run by model
3. Avg cost per run by model
4. Avg latency by model
5. Cost per successful run (efficiency metric)

**SQL Complexity:** Medium  
**API Route Needed:** `GET /api/observability/model-stats` (15 min)  
**Components:** Table with sortable columns, bar charts  
**Build Time:** 2-3 hours

---

### 2.5 Dashboard 5: Tool Usage Analytics
**Purpose:** Understand which tools are used and their performance  
**Data Sources:** tool_calls table  
**No New Tables:** ✅

**Charts:**
1. Most used tools (bar chart)
2. Tool success rate (%)
3. Avg latency per tool
4. Tool call volume trend
5. Failed tool calls (troubleshooting)

**SQL Complexity:** Medium  
**API Route Needed:** `GET /api/observability/tool-usage` (15 min)  
**Components:** BarChart, LineChart, Table  
**Build Time:** 2-3 hours

---

### 2.6 Dashboard 6: Run Performance Details (with Drill-Down)
**Purpose:** Deep dive into single run execution  
**Data Sources:** agent_runs, execution_trace (JSONB), tool_calls  
**No New Tables:** ✅

**Sections:**
1. Run header (status, timestamp, model, tokens, cost)
2. Workflow steps (table: step name, input, output, latency, tokens)
3. Tool calls (table: tool name, latency, input, output, status)
4. Full trace JSON viewer (expandable)
5. Error details (if failed)

**SQL Complexity:** Low  
**API Route Needed:** None (use existing `/api/agent/run/[runId]`)  
**Components:** RunDetailHeader, StepsTable, ToolCallsTable, JSONViewer  
**Build Time:** 2-3 hours (mostly component work)

---

### 2.7 Dashboard 7: Evaluation Performance Metrics
**Purpose:** Track test quality and improvement over time  
**Data Sources:** evaluation_runs, evaluation_run_results  
**No New Tables:** ✅

**Charts:**
1. Pass rate by dataset (bar chart)
2. Pass rate trend over time (line chart)
3. Example results table (with pass/fail status)
4. Improvement rate % (vs baseline)
5. Regression detection (failed examples that used to pass)

**SQL Complexity:** Medium  
**API Route Needed:** `GET /api/observability/eval-metrics` (15 min)  
**Components:** BarChart, LineChart, Table  
**Build Time:** 2-3 hours

---

### 2.8 Dashboard 8: Billing & Quota Management
**Purpose:** Track organization usage and quota enforcement  
**Data Sources:** organization_usage_events, org_billing  
**No New Tables:** ✅

**Sections:**
1. Current quota (progress bar: used / limit)
2. Usage ledger (append-only events table)
3. Cost forecast (if current trend continues)
4. Plan details (free/pro/enterprise limits)
5. Top event types (pie: reserved, refunded, completed, failed)

**SQL Complexity:** Medium  
**API Route Needed:** `GET /api/observability/usage-ledger` (15 min)  
**Components:** ProgressBar, Table, LineChart  
**Build Time:** 1-2 hours

---

### 2.9 Dashboard 9: Marketplace Agent Adoption Analytics (Optional, Lower Priority)
**Purpose:** For admins: track which marketplace agents are popular  
**Data Sources:** marketplace_agents + COUNT of runs per agent  
**No New Tables:** ✅

**Charts:**
1. Most popular agents (by run count)
2. Adoption trend (new agents over time)
3. Avg success rate by marketplace agent

**SQL Complexity:** Medium  
**API Route Needed:** `GET /api/observability/marketplace-adoption` (15 min)  
**Components:** Table, LineChart  
**Build Time:** 1-2 hours

---

## Part 3: Observability Dashboard Page Structure

```
apps/web/src/app/(authenticated)/observability/
├── page.tsx                      # Overview dashboard
├── layout.tsx                    # Nav + sidebar
├── daily-costs/
│   └── page.tsx                 # Cost analytics
├── performance/
│   ├── page.tsx                 # Success rates + model comparison
│   └── [modelName]/page.tsx     # Model detail page
├── failures/
│   └── page.tsx                 # Error analysis + troubleshooting
├── tools/
│   └── page.tsx                 # Tool usage statistics
├── runs/
│   ├── page.tsx                 # All runs table with filters
│   └── [runId]/page.tsx         # Run detail (execution trace, steps)
├── evaluations/
│   └── page.tsx                 # Eval performance metrics
└── billing/
    └── page.tsx                 # Quota and usage ledger
```

**Total Pages:** 10 pages (1 overview + 9 subsections)

---

## Part 4: Component Architecture

### 4.1 Reusable Chart Components (Need Integration)
```
apps/web/src/components/observability/
├── charts/
│   ├── LineChart.tsx           # For trends (cost, success rate, tokens)
│   ├── BarChart.tsx            # For comparisons (models, tools, agents)
│   ├── PieChart.tsx            # For distributions (status, event types)
│   ├── HistogramChart.tsx      # For distributions (cost per run, latency)
│   └── ComboChart.tsx          # For dual-axis (runs + cost)
├── cards/
│   ├── MetricCard.tsx          # Summary card (e.g., "Success Rate: 94%")
│   ├── TrendCard.tsx           # Metric + trend arrow
│   └── ProgressCard.tsx        # For quota display
├── tables/
│   ├── RunsTable.tsx           # Filterable runs table
│   ├── ErrorsTable.tsx         # Top errors table
│   ├── ToolsTable.tsx          # Tool statistics table
│   ├── EventsTable.tsx         # Billing events ledger
│   └── DataTable.tsx           # Generic sortable table (reusable)
├── panels/
│   ├── OverviewSummary.tsx     # 5 metric cards
│   ├── CostBreakdown.tsx       # Cost by agent/model
│   ├── FailureInsights.tsx     # Error grouping + patterns
│   └── ModelComparison.tsx     # Side-by-side model stats
├── details/
│   ├── RunDetailHeader.tsx     # Run metadata + status
│   ├── StepsPanel.tsx          # Workflow steps breakdown
│   ├── ToolCallsPanel.tsx      # Tool invocations
│   ├── ErrorPanel.tsx          # Error details + stack
│   └── JSONViewer.tsx          # Expandable trace viewer
└── layout/
    ├── DashboardNav.tsx        # Left sidebar with menu
    ├── DateRangeFilter.tsx     # Shared date filter
    └── ExportButton.tsx        # CSV/JSON export
```

**Total Components:** 22 components  
**Reusable Patterns:** 60% (many use generic DataTable, MetricCard)

### 4.2 Chart Library Decision
**Current State:** No chart library integrated  
**Recommended:** `recharts` (lightweight, React-friendly, no D3 complexity)  
**Installation:** `pnpm add recharts`  
**Setup Time:** 30 minutes

---

## Part 5: Missing API Routes (7 Required)

All new routes follow pattern: `GET /api/observability/*`  
All require: `authorization`, `org_id` parameter, response caching

### 5.1 Route: `/api/observability/summary`
**Purpose:** Overview metrics  
**Parameters:** `?org_id=<uuid>&days=30`  
**Response:**
```json
{
  "totalRuns": 1234,
  "successRate": 94.5,
  "failureCount": 67,
  "totalTokens": 2_456_789,
  "estimatedCost": 12.34,
  "avgLatencyMs": 2340,
  "successRateTrend": [
    {"date": "2026-06-01", "rate": 92},
    {"date": "2026-06-02", "rate": 93},
    ...
  ]
}
```
**Build Time:** 15 min (query + response)  
**Caching:** 5 minutes

### 5.2 Route: `/api/observability/daily-costs`
**Purpose:** Cost trends and breakdown  
**Parameters:** `?org_id=<uuid>&days=30&groupBy=agent|model|none`  
**Response:**
```json
{
  "dailyTrend": [
    {"date": "2026-06-01", "cost": 1.23, "runs": 45},
    ...
  ],
  "byAgent": [
    {"name": "CustomerBot", "cost": 5.67, "runs": 100},
    ...
  ],
  "byModel": [
    {"model": "gpt-4", "cost": 8.90, "runs": 150},
    ...
  ]
}
```
**Build Time:** 20 min  
**Caching:** 5 minutes

### 5.3 Route: `/api/observability/failure-analysis`
**Purpose:** Error patterns and troubleshooting  
**Parameters:** `?org_id=<uuid>&days=30`  
**Response:**
```json
{
  "statusDistribution": {
    "completed": 1234,
    "failed": 67,
    "pending": 5,
    "running": 2
  },
  "topErrors": [
    {"message": "Timeout", "count": 34, "percentage": 50.7},
    {"message": "API Rate Limit", "count": 20, "percentage": 29.9},
    ...
  ],
  "successRateTrend": [...]
}
```
**Build Time:** 20 min  
**Caching:** 5 minutes

### 5.4 Route: `/api/observability/model-stats`
**Purpose:** Compare model performance  
**Parameters:** `?org_id=<uuid>&days=30`  
**Response:**
```json
{
  "models": [
    {
      "name": "gpt-4",
      "runCount": 150,
      "successRate": 96.5,
      "avgTokens": 2345,
      "avgCostPerRun": 0.089,
      "avgLatencyMs": 2100,
      "costPerSuccessfulRun": 0.092
    },
    ...
  ]
}
```
**Build Time:** 15 min  
**Caching:** 5 minutes

### 5.5 Route: `/api/observability/tool-usage`
**Purpose:** Tool performance analytics  
**Parameters:** `?org_id=<uuid>&days=30&limit=20`  
**Response:**
```json
{
  "toolStats": [
    {
      "name": "SearchWeb",
      "callCount": 234,
      "successCount": 221,
      "successRate": 94.4,
      "avgLatencyMs": 1200,
      "totalLatency": 280_800
    },
    ...
  ]
}
```
**Build Time:** 15 min  
**Caching:** 5 minutes

### 5.6 Route: `/api/observability/eval-metrics`
**Purpose:** Evaluation performance  
**Parameters:** `?org_id=<uuid>&days=30`  
**Response:**
```json
{
  "totalDatasets": 12,
  "totalRuns": 45,
  "overallPassRate": 87.3,
  "byDataset": [
    {"datasetId": "uuid", "name": "CustomerBot_v1", "passRate": 92, "runCount": 10},
    ...
  ],
  "improvementRate": 2.3,
  "regressionRate": 0.5
}
```
**Build Time:** 15 min  
**Caching:** 5 minutes

### 5.7 Route: `/api/observability/usage-ledger`
**Purpose:** Billing events audit trail  
**Parameters:** `?org_id=<uuid>&eventType=quota_reserved&limit=50&offset=0`  
**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "eventType": "quota_reserved",
      "tokens": 5000,
      "estimatedCost": 0.15,
      "metadata": {"runId": "uuid", "model": "gpt-4"},
      "createdAt": "2026-06-22T10:30:00Z"
    },
    ...
  ],
  "total": 1234
}
```
**Build Time:** 15 min  
**Caching:** 2 minutes (for UI freshness)

---

## Part 6: Page Map with Component Breakdown

### Page 1: `/observability` (Overview)
```
OverviewPage
├── DashboardNav (sidebar)
├── DateRangeFilter (shared)
├── OverviewSummary
│   ├── MetricCard (runs)
│   ├── MetricCard (success %)
│   ├── MetricCard (tokens)
│   ├── MetricCard (cost)
│   └── MetricCard (latency)
└── LineChart (success rate trend)

API Call: GET /api/observability/summary
Data: {totalRuns, successRate, avgLatency, cost, trend}
Time to render: 1.5 seconds
```

### Page 2: `/observability/daily-costs`
```
DailyCostsPage
├── DashboardNav
├── DateRangeFilter
├── ComboChart (daily cost + run count)
├── Tabs
│   ├── "By Cost Trend"
│   │   └── LineChart (cost trend)
│   ├── "By Agent"
│   │   └── PieChart + Table (agent breakdown)
│   └── "By Model"
│       └── BarChart (cost by model)
└── CostBreakdown (summary stats)

API Call: GET /api/observability/daily-costs?groupBy=agent|model
Data: {dailyTrend, byAgent, byModel}
Time to render: 2 seconds
```

### Page 3: `/observability/performance`
```
PerformancePage
├── DashboardNav
├── DateRangeFilter
├── Tabs
│   ├── "Success Rate"
│   │   ├── PieChart (status distribution)
│   │   └── LineChart (hourly trend)
│   ├── "Model Performance"
│   │   └── ModelComparison (table with 6 columns)
│   └── "Latency"
│       └── BarChart (latency by model)

API Calls: 
  - GET /api/observability/summary (for success rate)
  - GET /api/observability/model-stats (for comparison)
Time to render: 2 seconds
```

### Page 4: `/observability/failures`
```
FailureAnalysisPage
├── DashboardNav
├── DateRangeFilter
├── FailureInsights
│   ├── PieChart (status distribution)
│   ├── LineChart (success rate trend)
│   └── ErrorsTable (top errors with counts)
└── TrendCard (failure rate vs goal)

API Call: GET /api/observability/failure-analysis
Data: {statusDistribution, topErrors, trend}
Time to render: 2 seconds
```

### Page 5: `/observability/tools`
```
ToolUsagePage
├── DashboardNav
├── DateRangeFilter
├── BarChart (most used tools)
├── Tabs
│   ├── "Usage Stats"
│   │   └── ToolsTable (table with metrics)
│   ├── "Performance"
│   │   └── BarChart (latency by tool)
│   └── "Failures"
│       └── ToolsTable (filtered to errors)
└── TrendCard (tool call count trend)

API Call: GET /api/observability/tool-usage
Data: {toolStats: [{name, callCount, successRate, avgLatency}]}
Time to render: 2 seconds
```

### Page 6: `/observability/runs`
```
RunsListPage
├── DashboardNav
├── DateRangeFilter
├── SearchBox (search by message, agent)
├── FilterButtons (status, model, org)
├── RunsTable
│   └── Columns: Created, Status, Message, Model, Tokens, Cost, Latency
└── Pagination

API Call: GET /api/agent/run?org_id=...&status=...&limit=50&offset=0
Data: {runs: [{id, status, message, model, tokens, cost, latency, createdAt}]}
Time to render: 1.5 seconds
Note: This already mostly exists, just add filtering
```

### Page 7: `/observability/runs/[runId]`
```
RunDetailPage
├── DashboardNav
├── RunDetailHeader (status badge, timestamp, model, cost)
├── Tabs
│   ├── "Steps"
│   │   └── StepsPanel
│   │       └── StepsTable (step name, input, output, tokens, latency)
│   ├── "Tools"
│   │   └── ToolCallsPanel
│   │       └── ToolCallsTable (tool name, latency, status)
│   ├── "Trace"
│   │   └── JSONViewer (execution_trace JSONB)
│   └── "Details"
│       └── ErrorPanel (if failed)
└── DownloadButton (export trace as JSON)

API Call: GET /api/agent/run/[runId]
Data: {run with execution_trace JSONB}
Time to render: 1 second
Note: This already exists, just add trace visualization
```

### Page 8: `/observability/evaluations`
```
EvaluationsPage
├── DashboardNav
├── DateRangeFilter
├── OverviewSummary (3 cards: datasets, runs, pass rate)
├── Tabs
│   ├── "Pass Rate Trend"
│   │   └── LineChart (over time)
│   ├── "By Dataset"
│   │   └── BarChart + Table
│   ├── "Results"
│   │   └── DataTable (paginated examples)
│   └── "Comparisons"
│       └── ComparisonCard (baseline vs candidate)
└── ImprovementMetrics (improvement %, regression %)

API Call: GET /api/observability/eval-metrics
Data: {totalDatasets, passRate, byDataset, improvementRate}
Time to render: 2 seconds
Note: Parts already exist, needs aggregation
```

### Page 9: `/observability/billing`
```
BillingPage
├── DashboardNav
├── FilterByEventType (select event type)
├── QuotaStatus
│   ├── ProgressCard (used / limit)
│   └── TrendCard (projection)
├── CostForecast (if trend continues)
├── Tabs
│   ├── "Usage Ledger"
│   │   └── EventsTable (events with pagination)
│   ├── "By Event Type"
│   │   └── PieChart + stats
│   └── "Plan Details"
│       └── PlanInfoCard (current plan limits)
└── ExportButton (export ledger as CSV)

API Call: GET /api/observability/usage-ledger?eventType=...
Data: {events: [{eventType, tokens, cost, metadata, createdAt}]}
Time to render: 2 seconds
```

---

## Part 7: Implementation Order (Ranked by Value & Effort)

### Tier 1: Highest Value, Lowest Effort (Start Here)
**Combined Value:** Org health visibility + most user requests  
**Combined Effort:** 8-10 hours

#### 1.1 Overview Dashboard (2-3 hours)
- 5 metric cards + success rate chart
- API route: `/api/observability/summary`
- Uses: `orgTelemetry()` SDK function
- Demo impact: ⭐⭐⭐ (shows platform health at glance)
- User value: ⭐⭐⭐ (answers: "how's my platform?")

#### 1.2 Daily Cost Analytics (2-3 hours)
- Cost trend chart + breakdown by agent/model
- API route: `/api/observability/daily-costs`
- Uses: Direct SQL aggregation on `agent_runs`
- Demo impact: ⭐⭐⭐ (financial visibility)
- User value: ⭐⭐⭐ (answers: "where's my money going?")

#### 1.3 Failure Analysis (2-3 hours)
- Status pie chart + error frequency table
- API route: `/api/observability/failure-analysis`
- Uses: Direct SQL on `agent_runs.status`, `error_message`
- Demo impact: ⭐⭐ (troubleshooting)
- User value: ⭐⭐ (answers: "why are runs failing?")

#### 1.4 Model Performance (1-2 hours)
- Model comparison table (6 columns: success %, tokens, cost, latency)
- API route: `/api/observability/model-stats`
- Uses: Direct SQL group by `model_name`
- Demo impact: ⭐⭐ (comparison insight)
- User value: ⭐⭐ (answers: "which model is best?")

**Subtotal for Tier 1:** 8-10 hours  
**Value Delivered:** 4 dashboards answering core org questions

---

### Tier 2: High Value, Medium Effort (Do Next)
**Combined Effort:** 6-8 hours

#### 2.1 Tool Usage Analytics (2-3 hours)
- Most used tools chart + performance table
- API route: `/api/observability/tool-usage`
- Uses: Direct SQL on `tool_calls` table
- Demo impact: ⭐⭐ (tool insight)
- User value: ⭐ (answers: "which tools work best?")

#### 2.2 Run Detail Deep-Dive (2-3 hours)
- Execution trace visualization (steps table + tool calls table)
- No new API route needed (use existing `/api/agent/run/[runId]`)
- Uses: Existing run data + JSONB parsing
- Demo impact: ⭐⭐⭐ (debugging power)
- User value: ⭐⭐⭐ (answers: "what happened in my run?")

#### 2.3 Billing & Quota (1-2 hours)
- Quota progress bar + usage ledger table
- API route: `/api/observability/usage-ledger`
- Uses: Existing `organization_usage_events` table
- Demo impact: ⭐ (operational)
- User value: ⭐⭐ (answers: "what's my quota usage?")

**Subtotal for Tier 2:** 6-8 hours  
**Value Delivered:** 3 more dashboards for debugging + billing

---

### Tier 3: Medium Value, More Effort (Polish)
**Combined Effort:** 4-6 hours

#### 3.1 Evaluation Performance (2-3 hours)
- Pass rate trends + results table
- API route: `/api/observability/eval-metrics`
- Uses: Existing `evaluation_runs`, `evaluation_run_results`
- Demo impact: ⭐⭐ (AI quality)
- User value: ⭐⭐ (answers: "are my evals improving?")

#### 3.2 Marketplace Adoption Analytics (1-2 hours)
- Most popular agents + adoption trend
- API route: `/api/observability/marketplace-adoption` (new)
- Uses: Existing marketplace data + run counts
- Demo impact: ⭐ (admin only)
- User value: ⭐ (answers: "which marketplace agents work?")

**Subtotal for Tier 3:** 4-6 hours  
**Value Delivered:** 2 specialty dashboards

---

## Part 8: Value & Effort Ranking

### By User Value (What Users Need Most)
1. **Overview Dashboard** ⭐⭐⭐ - "How's my platform?" (foundational)
2. **Daily Cost Analytics** ⭐⭐⭐ - "Am I staying on budget?" (financial)
3. **Run Detail Deep-Dive** ⭐⭐⭐ - "Debug this run" (troubleshooting)
4. **Failure Analysis** ⭐⭐ - "Why did this fail?" (troubleshooting)
5. **Model Performance** ⭐⭐ - "Which model to use?" (optimization)
6. **Evaluation Metrics** ⭐⭐ - "Is eval quality improving?" (quality)
7. **Billing & Quota** ⭐⭐ - "What's my usage?" (operational)
8. **Tool Usage** ⭐ - "Which tools are working?" (optimization)
9. **Marketplace Adoption** ⭐ - "Which agents are popular?" (admin only)

### By Demo Value (What Impresses)
1. **Daily Cost Analytics** ⭐⭐⭐ - Visual spending trends (VC loves this)
2. **Model Performance** ⭐⭐⭐ - Comparative analysis (LLM efficiency)
3. **Run Detail Deep-Dive** ⭐⭐⭐ - Beautiful trace visualization
4. **Failure Analysis** ⭐⭐ - Error patterns visualization
5. **Overview Dashboard** ⭐⭐ - Metrics at glance
6. **Tool Usage** ⭐⭐ - Tool ecosystem insight
7. **Evaluation Metrics** ⭐⭐ - Quality measurement
8. **Billing & Quota** ⭐ - Operational detail
9. **Marketplace Adoption** ⭐ - Internal metrics only

### By Engineering Effort (Easiest to Hardest)
1. **Billing & Quota** ⭐ (1-2 hrs) - Simple table + progress bar
2. **Overview Dashboard** ⭐ (2-3 hrs) - Metric cards, one API call
3. **Tool Usage** ⭐ (2-3 hrs) - SQL query + bar chart
4. **Failure Analysis** ⭐⭐ (2-3 hrs) - Pie chart + error table
5. **Run Detail Deep-Dive** ⭐⭐ (2-3 hrs) - Parse JSONB, build panels
6. **Daily Cost Analytics** ⭐⭐ (2-3 hrs) - Multiple charts, grouping
7. **Model Performance** ⭐⭐ (1-2 hrs) - Sortable table
8. **Evaluation Metrics** ⭐⭐ (2-3 hrs) - Conditional logic
9. **Marketplace Adoption** ⭐⭐ (1-2 hrs) - Join marketplaces + runs

### Overall Priority Ranking (Value × Demo ÷ Effort)
| Rank | Dashboard | Score | Reason |
|------|-----------|-------|--------|
| 1️⃣ | **Overview** | 9/10 | High user value, quick build, addresses core need |
| 2️⃣ | **Daily Costs** | 9/10 | High user + demo value, medium effort |
| 3️⃣ | **Run Details** | 8/10 | High user + demo value, medium effort |
| 4️⃣ | **Failure Analysis** | 7/10 | Good user value, medium effort |
| 5️⃣ | **Model Performance** | 7/10 | Good demo + user value, quick build |
| 6️⃣ | **Evaluation Metrics** | 6/10 | Medium value, more effort |
| 7️⃣ | **Tool Usage** | 5/10 | Lower user value, quick build |
| 8️⃣ | **Billing & Quota** | 5/10 | Operational only, quick build |
| 9️⃣ | **Marketplace Adoption** | 3/10 | Admin only, limited value |

---

## Part 9: Implementation Roadmap

### Phase 1: MVP Observability (1-2 Weeks)
**Goal:** Ship 4 core dashboards that answer "how's my platform?"  
**Effort:** 10-14 hours of engineering  
**Deliverables:** Overview, Costs, Failures, Model Performance

```
Week 1:
  Day 1: Setup observability folder structure + chart library
  Day 2: Build overview page + API route
  Day 3: Build daily costs page + API route
  Day 4: Build failure analysis page + API route
  Day 5: Build model performance page + API route
  
Week 2:
  Day 1: Add date filters to all pages
  Day 2: Add export/download buttons
  Day 3: Performance optimization + caching
  Day 4: User testing + UX tweaks
  Day 5: Deploy to staging
```

### Phase 2: Execution & Billing (Week 2-3)
**Goal:** Debug and financial tracking  
**Effort:** 8-10 hours of engineering  
**Deliverables:** Run Details, Tool Usage, Billing & Quota

```
Week 2-3:
  Day 1: Build run detail trace visualization
  Day 2: Build tool usage analytics page + API
  Day 3: Build billing/quota page + API
  Day 4: Integration testing + bug fixes
  Day 5: Deploy
```

### Phase 3: Quality & Polish (Week 3-4)
**Goal:** Evaluation quality + marketplace insights  
**Effort:** 5-7 hours of engineering  
**Deliverables:** Evaluation Metrics, Marketplace Adoption, UI polish

```
Week 3-4:
  Day 1: Build eval metrics page + API
  Day 2: Build marketplace adoption analytics
  Day 3: UI polish + accessibility fixes
  Day 4: Performance optimization
  Day 5: Final testing + documentation
```

**Total Timeline:** 3-4 weeks for full observability platform

---

## Part 10: Missing Infrastructure (NOT Recommended Yet)

### Things NOT to build (would duplicate existing data):
- ❌ Separate analytics database (data already in Postgres)
- ❌ Data warehouse / BI tool (overkill for MVP)
- ❌ Event streaming queue (data already immutable)
- ❌ Time-series database (Postgres JSON sufficient)

### Things to add LATER (not critical):
- Real-time WebSocket updates (dashboards can refresh on 5-min cycle)
- Custom alerts (email on error spike) - can be polling for now
- Data retention policies (audit logs grow forever)
- Export to BI tools (CSV for now)
- Mobile dashboards (desktop only for MVP)

---

## Part 11: Quick Start Checklist

### Setup (2-3 hours)
- [ ] Install `recharts` package (`pnpm add recharts`)
- [ ] Create observability folder structure (9 pages)
- [ ] Create DashboardNav component + sidebar
- [ ] Create DateRangeFilter component (shared)
- [ ] Create 3-4 reusable chart components (Line, Bar, Pie)
- [ ] Create MetricCard + TrendCard components

### Phase 1 APIs (3-4 hours)
- [ ] `GET /api/observability/summary` - 15 min
- [ ] `GET /api/observability/daily-costs` - 20 min
- [ ] `GET /api/observability/failure-analysis` - 20 min
- [ ] `GET /api/observability/model-stats` - 15 min

### Phase 1 Pages (5-6 hours)
- [ ] `/observability` (overview) - 2 hrs
- [ ] `/observability/daily-costs` - 2 hrs
- [ ] `/observability/failures` - 1.5 hrs
- [ ] `/observability/performance` - 1 hr

### Phase 1 Testing (1-2 hours)
- [ ] Test all API routes with real data
- [ ] Test date filtering
- [ ] Test error handling
- [ ] Performance test (load time <2s)

### Phase 2+ (Incremental)
- [ ] More API routes (3-4 hours)
- [ ] More pages (5-6 hours)
- [ ] Polish & optimization (2-3 hours)

---

## Part 12: Recommendations & Next Steps

### Immediate Wins
1. **This Week:** Start Phase 1 MVP
   - Focus on Overview + Costs (2 dashboards)
   - Highest ROI (addresses "how's my platform?")
   - ~4-5 hours of work

2. **Next Week:** Complete Phase 1
   - Add Failures + Model Performance
   - Ship first observability experience
   - ~6-8 hours more work

3. **Following Week:** Phase 2
   - Run details + billing/quota
   - Enable financial tracking
   - ~8-10 hours work

### Success Metrics (What Good Looks Like)
- ✅ Users can see platform health in <3 clicks
- ✅ Users understand where money is going
- ✅ Users can debug failed runs
- ✅ Dashboards load in <2 seconds
- ✅ All charts are interactive (hover, filter)
- ✅ Mobile-responsive design (or noted as future)

### Risk Mitigation
- **Risk:** Too many queries hitting DB → **Mitigation:** Add 5-min caching on all observability routes
- **Risk:** Charts look ugly → **Mitigation:** Use recharts defaults + Tailwind styling
- **Risk:** JSONB parsing slow → **Mitigation:** Parse in app code, not SQL (avoids complex SQL)
- **Risk:** Scope creep → **Mitigation:** Hard stop at 9 dashboards, defer customization

---

## Summary

**Backend Capabilities:** Excellent (25+ fields, multiple telemetry tables, RPC helpers)  
**Frontend Gap:** Significant (no dashboards, no aggregation UIs)  
**Build Path:** Clear (9 dashboards, all data exists, no new infrastructure)  
**Time to MVP:** 1-2 weeks (10-14 hours Phase 1)  
**Time to Complete:** 3-4 weeks (25-30 hours total)

**Best ROI:** Start with Overview + Costs dashboards this week. Both high-value, quick-to-build, and directly address user needs.

---

*End of Product Readiness Audit*
