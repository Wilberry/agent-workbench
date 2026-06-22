# Agent Workbench User Flow Audit
**Date:** June 22, 2026  
**Focus:** 10 Critical User Flows - Implementation Status, Missing Features & Cross-Cutting Concerns

---

## Executive Summary

| Flow | Status | Completeness | Test Coverage |
|------|--------|--------------|---|
| 1. Create Organization | ⚠️ Partially Complete | ~30% | N |
| 2. Create Agent | ⚠️ Partially Complete | ~70% | Y |
| 3. Create Agent Version | 🚧 In Progress | ~50% | Y |
| 4. Execute Agent | ✅ Complete | ~90% | Y |
| 5. Replay Run | ✅ Complete | ~85% | Y |
| 6. View Run History | ✅ Complete | ~80% | Y |
| 7. Create Evaluation Dataset | ⚠️ Partially Complete | ~75% | N |
| 8. Create Evaluation Run | ⚠️ Partially Complete | ~70% | Y |
| 9. View Evaluation Results | ⚠️ Partially Complete | ~65% | N |
| 10. Compare Evaluation Runs | ⚠️ Partially Complete | ~60% | N |

---

## Detailed Flow Audit

### 1. Create Organization
**Status:** ⚠️ Partially Complete | **Completion:** ~30%

**Checked Components:**
- ✅ Database Schema: [organizations, organization_memberships tables](supabase/migrations/000007_create_orgs_and_teams.sql)
- ✅ SDK Function: [orgs.createOrg()](packages/sdk/src/orgs.ts#L17)
- ❌ API Endpoint: **MISSING** - No POST /api/org endpoint
- ❌ UI Component: **MISSING** - No org creation form
- ❌ Post-signup Flow: **MISSING** - No org creation on signup
- ❌ Role Initialization: **MISSING** - Roles created but no UI for assignment

**Missing Pieces:**
1. No API route to create organizations (should be POST /api/org)
2. No UI form for organization creation
3. No organization creation step in signup flow (users skip directly to agents)
4. Signup page only handles user auth, doesn't trigger org creation
5. No default team creation for new orgs

**Missing Backend APIs:**
- POST /api/org - Create organization
- GET /api/org - List user organizations
- PUT /api/org/[orgId] - Update organization settings
- DELETE /api/org/[orgId] - Delete organization

**Missing UI Components:**
- Organization creation modal/form
- Organization settings page
- Organization member management UI
- Organization billing/plan UI

**Test Coverage:** ❌ No tests for org creation flow (only org listing tested in [organizations.spec.ts](tests/e2e/organizations.spec.ts#L12))

**Form Validation:** ❌ None implemented (no validation in API layer)

**Error Handling:**
- SDK function throws errors but no error boundary
- No client-side error display
- No retry logic

**Issues:**
- [x] Org billing table created but no org_billing init in createOrg
- Actually fixed - line 67-68 in orgs.ts does create billing record
- ❌ No slug generation/validation
- ❌ No permission checks for who can create org

---

### 2. Create Agent
**Status:** ⚠️ Partially Complete | **Completion:** ~70%

**Checked Components:**
- ✅ Database Schema: [agents table](supabase/migrations/000006_agent_runs.sql)
- ✅ API Endpoint: [POST /api/org/[orgId]/agents](apps/web/src/app/api/org/[orgId]/agents/route.ts#L16)
- ✅ UI Form: [/agents/new page](apps/web/src/app/(authenticated)/agents/new/page.tsx)
- ✅ Post-creation Redirect: Redirects with ?success=true
- ⚠️ Model Selection: Hardcoded dropdown, only accepts string input

**Implementation Details:**

**Form Fields:**
- name (required) ✅
- description (optional) ✅
- system_prompt (required) ✅
- model (required, defaults to gpt-4o-mini) ✅

**Validation:**
- Client: HTML5 required attribute ✅
- Server: [Line 13-16 in new/page.tsx](apps/web/src/app/(authenticated)/agents/new/page.tsx#L13)
  ```typescript
  if (!name || !system_prompt) {
    throw new Error('Name and system prompt are required');
  }
  ```

**Missing Pieces:**
1. ❌ No model dropdown selector - hardcoded or text input
2. ❌ No workflow definition in UI (users can't define workflow steps)
3. ❌ No tool selection UI
4. ❌ No preview of agent behavior
5. ❌ No agent type/category selection

**Error Handling:**
- ⚠️ Server action throws errors, but no error boundary
- ❌ No user-friendly error messages
- ❌ No retry UI for failed creation

**Loading States:**
- ✅ Submit button has disabled state (implicit with server action)
- ⚠️ No explicit loading indicator visible to user

**Test Coverage:**
- ✅ E2E test exists: [agents.spec.ts](tests/e2e/agents.spec.ts#L4)
- ❌ No validation error tests
- ❌ No model selection tests

**UI/UX Issues:**
- ✅ Success message displays on redirect ([agents/page.tsx](apps/web/src/app/(authenticated)/agents/page.tsx#L21))
- ❌ No success toast/notification system

---

### 3. Create Agent Version
**Status:** 🚧 In Progress | **Completion:** ~50%

**Checked Components:**
- ✅ Database Schema: [agent_versions table](supabase/migrations/000009_agents_versions_and_tools.sql#L3)
- ⚠️ SDK Functions: [agents.ts - versioning methods exist but partially implemented](packages/sdk/src/agents.ts)
- ⚠️ Versioning Logic: Schema supports versions, but UI/flow not fully implemented
- ❌ API Endpoint: **MISSING** - No explicit POST /api/agents/[agentId]/version
- ❌ UI Component: **MISSING** - No version creation form
- ⚠️ Deployment: Only marketplace_agents table exists, but publish endpoint only updates visibility

**Analyzed Schema:**
- [agent_versions table](supabase/migrations/000009_agents_versions_and_tools.sql#L3-L13):
  - Stores: id, agent_id, version, description, system_prompt, workflow, metadata
  - UNIQUE constraint on (agent_id, version)

**Implementation Details:**
- Version creation should happen when publishing to marketplace
- Versions can be pinned for evaluation runs (verified in [evaluations.spec.ts](tests/integration/evaluations.spec.ts#L60))
- Current publish endpoint: [publish/route.ts](apps/web/src/app/api/org/[orgId]/agents/[agentId]/publish/route.ts) only updates marketplace visibility

**Missing Pieces:**
1. ❌ No explicit version creation UI step
2. ❌ No versioning triggered on agent save
3. ❌ No version history UI showing all versions
4. ❌ No version comparison UI (this vs that)
5. ❌ No semantic versioning enforcement (1.0, 1.1, 2.0)
6. ❌ No changelog/release notes per version

**Missing Backend APIs:**
- POST /api/agents/[agentId]/versions - Create version
- GET /api/agents/[agentId]/versions - List versions
- PUT /api/agents/[agentId]/versions/[versionId] - Update version metadata
- POST /api/agents/[agentId]/versions/[versionId]/publish - Publish to marketplace

**Missing UI Components:**
- Version creation form/modal
- Version history list with diff view
- Version selection for publishing

**Test Coverage:**
- ✅ Version pinning tested in [versioning-runtime.spec.ts](tests/integration/versioning-runtime.spec.ts)
- ✅ Eval runs use pinned versions [evaluations.spec.ts](tests/integration/evaluations.spec.ts#L60-L75)
- ❌ No UI tests for version creation

**Workflow Definition:**
- ✅ Schema supports workflow array in agent_versions
- ⚠️ Currently only 3 hardcoded steps: ['Planner', 'Executor', 'Reviewer']
- ❌ No UI to customize workflow

---

### 4. Execute Agent
**Status:** ✅ Complete | **Completion:** ~90%

**Checked Components:**
- ✅ API Endpoint: [POST /api/agent/run](apps/web/src/app/api/agent/run/route.ts#L108)
- ✅ Queue System: [agent_run_jobs table & dequeue function](supabase/migrations/000011_agent_run_queue.sql)
- ✅ Message Persistence: Messages saved to `messages` table
- ✅ Response Streaming: [enqueueAgentRun() queues with runId](apps/web/src/app/api/agent/run/route.ts#L70)
- ✅ Authorization: [authorizeExecution() checks user/org access](apps/web/src/lib/agentExecutionAuth.ts#L37)
- ✅ Quota Enforcement: [reserveQuota() called before enqueue](apps/web/src/app/api/agent/run/route.ts#L67)
- ✅ UI Component: [AgentChat component](apps/web/src/components/AgentChat.tsx)

**Implementation Details:**

**Execution Flow:**
```
1. POST /api/agent/run (line 108)
   ├─ Auth check ✅
   ├─ Parse request body ✅
   ├─ authorizeExecution() ✅
   ├─ Save user message to DB ✅
   ├─ Reserve quota ✅
   ├─ Enqueue to agent_run_jobs ✅
   └─ Return 202 with runId ✅
```

**Message Persistence:**
- ✅ User message saved [line 48](apps/web/src/app/api/agent/run/route.ts#L48)
- ✅ Messages table has foreign key to conversations
- ✅ Role-based message tracking (user/assistant)

**Status Codes:**
- ✅ 400 - Missing required fields
- ✅ 401 - Not authenticated
- ✅ 403 - Authorization failed
- ✅ 202 - Accepted (async processing)

**Missing Pieces:**
1. ⚠️ Rate limiting - **NO RATE LIMITING implemented**
2. ⚠️ Request validation - Only checks required fields, not data types
3. ❌ Input sanitization - No XSS/injection protection
4. ⚠️ Concurrency - No max concurrent runs per user/org

**Error Handling:**
- ✅ Catches ExecutionAuthorizationError
- ✅ Catches QuotaExceededError
- ⚠️ Generic catch logs errors but returns 500

**Test Coverage:**
- ✅ API route tested [api.spec.ts](tests/integration/api.spec.ts#L29-L52)
- ✅ E2E test [runs.spec.ts](tests/e2e/runs.spec.ts#L4)
- ✅ Security tests [agent-run-auth.spec.ts](tests/security/agent-run-auth.spec.ts)
- ✅ Quota enforcement tested [quota-api-enforcement.spec.ts](tests/security/quota-api-enforcement.spec.ts)

**Loading States:**
- ✅ AgentChat shows loading state while awaiting response
- ✅ Submit button disabled during request

**Issues to Address:**
- Missing rate limiting on API
- No request validation beyond required fields
- No input sanitization

---

### 5. Replay Run
**Status:** ✅ Complete | **Completion:** ~85%

**Checked Components:**
- ✅ API Endpoint: [POST /api/agent/replay](apps/web/src/app/api/agent/replay/route.ts)
- ✅ Replay Logic: [agentRuns.replayRun() in SDK](packages/sdk/src/agentRuns.ts)
- ✅ UI Component: [ReplayButton.tsx](apps/web/src/components/ReplayButton.tsx)
- ✅ Version Selection: Dropdown to select version to replay with
- ✅ Permission Checks: Verifies user owns original run
- ✅ Run Retrieval: Fetches original run details

**Implementation Details:**

**Replay Flow:**
```
1. User selects run and clicks "Replay"
2. ReplayButton shows version selector dropdown ✅
3. User selects version (or latest) ✅
4. POST /api/agent/replay called with:
   - originalRunId ✅
   - versionId (optional) ✅
   - reason (optional) ✅
5. API creates new run with same conversation/message ✅
6. Returns replayRunId ✅
```

**Version Selection:**
- ✅ Dropdown shows all available versions [line 64](apps/web/src/components/ReplayButton.tsx#L64)
- ✅ Shows version number and creation date
- ✅ Defaults to latest if not specified

**Error Handling:**
- ✅ Displays error message in red box [line 50-55](apps/web/src/components/ReplayButton.tsx#L50)
- ✅ Gracefully handles original run not found
- ✅ Checks authorization (403 if not owner)

**Test Coverage:**
- ✅ E2E test [replay.spec.ts](tests/e2e/replay.spec.ts#L4) - basic flow
- ✅ Integration test [versioning-replay.spec.ts](tests/integration/versioning-replay.spec.ts)
- ❌ No test for permission denial
- ❌ No test for invalid version selection

**Loading States:**
- ✅ `isLoading` state shown in button text [line 83](apps/web/src/components/ReplayButton.tsx#L83)
- ✅ Button disabled during request
- ✅ Modal closes on success

**Missing Pieces:**
1. ⚠️ Rate limiting - No limit on replay requests
2. ❌ Replay metadata - No tracking of why/when replayed
3. ❌ Comparison UI - No side-by-side comparison with original
4. ❌ Bulk replay - Can't replay multiple runs at once
5. ❌ Schedule replay - No ability to schedule future replays

**UI/UX Issues:**
- ✅ Clear version selection interface
- ❌ No visualization of which version is "newer"
- ❌ No indication of when version was created vs run

---

### 6. View Run History
**Status:** ✅ Complete | **Completion:** ~80%

**Checked Components:**
- ✅ List Page: [/runs](apps/web/src/app/(authenticated)/runs/page.tsx)
- ✅ Detail Page: [/runs/[runId]](apps/web/src/app/(authenticated)/runs/[runId]/page.tsx)
- ✅ Trace Viewer: [/traces](apps/web/src/app/(authenticated)/traces/page.tsx)
- ✅ Trace Timeline: [ExecutionTraceTimeline.tsx](apps/web/src/components/ExecutionTraceTimeline.tsx)
- ✅ Status Display: Shows pending/running/completed/failed
- ✅ Token Accounting: [execution_trace includes token counts](apps/web/src/app/(authenticated)/traces/page.tsx#L18)

**Implementation Details:**

**Runs List Page:**
- ✅ Fetches runs for authenticated user [line 26](apps/web/src/app/(authenticated)/runs/page.tsx#L26)
- ✅ Shows status breakdown (total/completed/running/pending/failed) [line 34-43](apps/web/src/app/(authenticated)/runs/page.tsx#L34)
- ✅ Displays workflow steps per run
- ✅ Shows creation date
- ✅ Links to run detail page

**Status Colors:**
- ✅ Yellow (pending)
- ✅ Blue (running)
- ✅ Green (completed)
- ✅ Red (failed)

**Trace Explorer Page:**
- ✅ Lists runs with filtering [line 65-72](apps/web/src/app/(authenticated)/traces/page.tsx#L65)
- ✅ Filter by status [line 49](apps/web/src/app/(authenticated)/traces/page.tsx#L49)
- ✅ Filter by tool used [line 50-56](apps/web/src/app/(authenticated)/traces/page.tsx#L50)
- ✅ Search by ID or workflow [line 51-53](apps/web/src/app/(authenticated)/traces/page.tsx#L51)
- ✅ Extracts tool names from execution_trace

**Token Accounting:**
- ✅ Type shows `total_tokens` and `estimated_cost` [line 16-17](apps/web/src/app/(authenticated)/traces/page.tsx#L16)
- ⚠️ No display of token breakdown per step
- ⚠️ No model cost calculation shown

**Missing Pieces:**
1. ⚠️ Token Breakdown - No per-step token display
2. ❌ Cost Display - `estimated_cost` available but not shown on UI
3. ❌ Latency Display - `latency_ms` available but not shown
4. ❌ Export/Download - No way to export runs as CSV/JSON
5. ❌ Pagination - No pagination on large result sets

**Error Handling:**
- ✅ Shows "Not authenticated" if no user
- ⚠️ No error display for failed run fetches
- ❌ No retry logic

**Test Coverage:**
- ✅ E2E test [runs.spec.ts](tests/e2e/runs.spec.ts) - lists runs
- ✅ E2E test [tracing.spec.ts](tests/e2e/tracing.spec.ts) - trace viewing
- ❌ No test for filtering by status
- ❌ No test for search

**UI/UX Issues:**
- ❌ No timestamps on runs (only dates)
- ❌ No run duration display
- ❌ No run completion percentage for running runs
- ⚠️ Tool names extracted but not displayed on runs list

---

### 7. Create Evaluation Dataset
**Status:** ⚠️ Partially Complete | **Completion:** ~75%

**Checked Components:**
- ✅ API Endpoint: [POST /api/evaluations/datasets](apps/web/src/app/api/evaluations/datasets/route.ts)
- ✅ UI Form: [EvaluationDatasetTable.tsx](apps/web/src/components/evaluations/EvaluationDatasetTable.tsx#L78)
- ✅ SDK Function: [evaluations.createDataset()](packages/sdk/src/evaluations.ts)
- ⚠️ Example Upload: Form exists but limited validation
- ❌ Bulk Example Import: No CSV/JSON upload for examples
- ⚠️ Dataset Listing: Shows datasets but pagination missing

**Implementation Details:**

**Dataset Creation Form:**
```
Fields:
- name (required) ✅
- description (optional) ✅
- tags (comma-separated) ✅
```

**Form UI:**
- ✅ Hidden toggle form [line 24](apps/web/src/components/evaluations/EvaluationDatasetTable.tsx#L24)
- ✅ Form fields with labels
- ⚠️ Tags as comma-separated string (not chips)
- ✅ Error message display [line 26](apps/web/src/components/evaluations/EvaluationDatasetTable.tsx#L26)

**Validation:**
- Client: No validation (form just submitted)
- Server: [Line 13-22](apps/web/src/app/api/evaluations/datasets/route.ts#L13) checks auth and parses
- ❌ No server-side validation of dataset name (duplicates allowed)
- ❌ No tag validation

**API Implementation:**
```typescript
// POST /api/evaluations/datasets
{
  organizationId?: string,
  agentId?: string,
  name: string,
  description?: string,
  tags?: string[],
  metadata?: object
}
```

**Error Handling:**
- ✅ Returns error message to client [line 61](apps/web/src/app/api/evaluations/datasets/route.ts#L61)
- ⚠️ No specific error types (all 500)
- ❌ No retry UI

**Loading States:**
- ✅ `isSaving` state tracked [line 23](apps/web/src/components/evaluations/EvaluationDatasetTable.tsx#L23)
- ✅ Button shows loading text
- ✅ Form disabled during save

**Missing Pieces:**
1. ❌ Bulk example import (CSV/JSON)
2. ❌ Example input form in dataset creation (must add examples after)
3. ❌ Dataset preview after creation
4. ❌ Example validation on upload
5. ❌ Max dataset size limits
6. ❌ Duplicate dataset detection

**Missing Backend APIs:**
- POST /api/evaluations/datasets/[datasetId]/examples/bulk - Bulk import examples
- POST /api/evaluations/datasets/[datasetId]/examples/validate - Validate examples

**Missing UI Components:**
- Example input/upload form
- Bulk import modal
- Example preview grid
- Dataset template browser

**Test Coverage:**
- ✅ Dataset creation tested [evaluations.spec.ts](tests/integration/evaluations.spec.ts#L23)
- ✅ Adding examples tested [evaluations.spec.ts](tests/integration/evaluations.spec.ts#L32)
- ❌ No UI test for dataset creation form
- ❌ No test for example bulk import

**Issues:**
- Tags stored as array in DB but UI treats as string
- No validation of example input/output schema
- No schema inference from examples

---

### 8. Create Evaluation Run
**Status:** ⚠️ Partially Complete | **Completion:** ~70%

**Checked Components:**
- ✅ API Endpoint: [POST /api/evaluations/runs](apps/web/src/app/api/evaluations/runs/route.ts)
- ✅ SDK Function: [evaluations.createEvaluationRun()](packages/sdk/src/evaluations.ts)
- ⚠️ UI Form: **MISSING** - No form to create runs
- ✅ Version Pinning: Supports specifying agentVersionId
- ✅ Progress Tracking: Results computed after all examples run

**Implementation Details:**

**Evaluation Run Creation:**
```
POST /api/evaluations/runs
{
  datasetId: string (required),
  agentVersionId: string (required),
  organizationId?: string
}
```

**Response:**
```
{
  run: {id, status, created_at, ...},
  results: [{example_id, output, expected, match_type}],
  summary: {exact_match_rate, pass_rate, ...}
}
```

**Result Types:**
- ✅ Exact match (case-insensitive)
- ⚠️ Only one metric type ("exact_match_rate") in summary

**Error Handling:**
- ✅ Checks authentication
- ✅ Returns 201 on success
- ⚠️ Generic error messages (no validation errors)

**Test Coverage:**
- ✅ Evaluation run creation tested [evaluations.spec.ts](tests/integration/evaluations.spec.ts#L51)
- ✅ Version pinning verified
- ✅ Result computation verified
- ❌ No UI test (no UI form exists)

**Missing Pieces:**
1. ❌ **UI Form to Create Runs** - Critical!
2. ❌ Agent version selector
3. ❌ Dataset selector
4. ❌ Run confirmation/preview
5. ❌ Progress indicator while running
6. ❌ Cancellation capability

**Missing Backend APIs:**
- GET /api/evaluations/runs - List runs with filters
- DELETE /api/evaluations/runs/[runId] - Cancel/delete run

**Missing UI Components:**
- Evaluation run creation form/modal
- Agent version selector
- Dataset selector with preview
- Run progress bar

**UI/UX Issues:**
- ❌ No way for users to create runs from UI!
- ❌ Only created via direct API or tests

---

### 9. View Evaluation Results
**Status:** ⚠️ Partially Complete | **Completion:** ~65%

**Checked Components:**
- ✅ Results Page: [/evaluations/runs/[runId]](apps/web/src/app/(authenticated)/evaluations/runs/[runId]/page.tsx)
- ✅ Results Table: [EvaluationResultsTable.tsx](apps/web/src/components/evaluations/EvaluationResultsTable.tsx)
- ✅ Summary Card: [EvaluationRunSummaryCard.tsx](apps/web/src/components/evaluations/EvaluationRunSummaryCard.tsx)
- ⚠️ Pass/Fail Breakdown: Summary exists but limited metrics
- ❌ Example Review: No detailed example inspection

**Implementation Details:**

**Results Display:**
- ✅ Runs list shows status and summary
- ✅ Results table shows example-by-example results
- ✅ Summary card shows exact_match_rate

**Metrics Tracked:**
- `exact_match_rate` - Case-insensitive string matching
- ⚠️ Only one metric type shown (no other evaluation methods)

**Result Table Columns:**
- ✅ Example ID
- ✅ Input
- ✅ Expected output
- ✅ Actual output
- ✅ Match status (pass/fail)

**Missing Pieces:**
1. ❌ Detailed Example Inspection - No modal/expand to see full context
2. ❌ Multiple Evaluation Metrics - Only exact_match implemented
3. ❌ Semantic Similarity Score - No LLM-based comparison
4. ❌ Token Usage per Example - Not tracked
5. ❌ Latency per Example - Not tracked
6. ❌ Export Results - No CSV/JSON download
7. ❌ Filter/Sort Results - No filtering by pass/fail or status
8. ❌ Failed Example Details - No error messages or trace

**Missing Backend APIs:**
- GET /api/evaluations/runs/[runId]/results - Get paginated results
- GET /api/evaluations/runs/[runId]/results/export - Export as CSV
- GET /api/evaluations/runs/[runId]/results/[resultId] - Get single result details

**Missing UI Components:**
- Example detail modal/sidebar
- Results filter/sort UI
- Export button
- Metrics breakdown chart
- Failed run diagnostics panel

**Test Coverage:**
- ❌ No E2E tests for results viewing
- ❌ No integration tests for results retrieval
- ✅ Results computed correctly in [evaluations.spec.ts](tests/integration/evaluations.spec.ts#L73)

**UI/UX Issues:**
- ❌ No pagination on large result sets
- ❌ No indication of run duration
- ❌ No retry/debug options for failed examples

---

### 10. Compare Evaluation Runs
**Status:** ⚠️ Partially Complete | **Completion:** ~60%

**Checked Components:**
- ✅ Compare Form: [EvaluationCompareForm.tsx](apps/web/src/components/evaluations/EvaluationCompareForm.tsx)
- ✅ Comparison Card: [EvaluationComparisonCard.tsx](apps/web/src/components/evaluations/EvaluationComparisonCard.tsx)
- ✅ Run Selector: Dropdown to select baseline and candidate runs
- ⚠️ Delta Calculation: Basic comparison logic but limited metrics
- ❌ Improvement/Regression Counting: Partially implemented

**Implementation Details:**

**Comparison Form:**
- ✅ Two dropdowns: baseline and candidate runs [line 18-43](apps/web/src/components/evaluations/EvaluationCompareForm.tsx#L18)
- ✅ Shows run label and dataset name
- ✅ Passes to comparison card for analysis

**Comparison Card Logic:**
- ✅ Shows baseline and candidate summaries
- ✅ Displays exact_match_rate for each
- ⚠️ Simple delta calculation (candidate - baseline)
- ❌ No improvement/regression example counting

**Missing Pieces:**
1. ❌ Improvement Detection - No tracking of which examples improved
2. ❌ Regression Detection - No tracking of which examples got worse
3. ❌ Neutral Changes - No indication of unchanged examples
4. ❌ Statistical Significance - No confidence intervals or p-values
5. ❌ Multiple Metrics Comparison - Only exact_match_rate compared
6. ❌ Example-level Diff - Can't see which specific examples changed

**Missing Backend APIs:**
- POST /api/evaluations/runs/[baselineId]/compare/[candidateId] - Compute detailed comparison
- GET /api/evaluations/runs/compare - Compare multiple runs

**Missing UI Components:**
- Example diff viewer (side-by-side)
- Improvement/regression badges
- Statistical significance display
- Multi-metric comparison chart
- Run timeline (showing test progression)

**Comparison Metrics Needed:**
- ❌ Exact match improvement count
- ❌ Exact match regression count
- ❌ Neutral count
- ❌ Percentage improvement
- ❌ Statistical significance test

**Test Coverage:**
- ❌ No tests for comparison logic
- ❌ No tests for delta calculation
- ❌ No tests for improvement/regression counting

**UI/UX Issues:**
- ❌ No visual indication of which is better
- ❌ Can't easily spot which examples changed
- ❌ No indication of run parameters that differ

**Data Structure Issues:**
- ⚠️ Runs stored separately, no explicit comparison record
- ❌ No comparison versioning (can't replay comparison)

---

## Cross-Cutting Concerns

### Rate Limiting
**Status:** ❌ **NOT IMPLEMENTED**

**Missing:**
- ❌ No rate limiting on any API endpoint
- ❌ No request throttling
- ❌ No quota per user/org
- ❌ No burst protection

**Recommendation:**
- Implement middleware for rate limiting (e.g., Upstash Redis)
- Apply to all POST/PUT/DELETE endpoints
- Different limits per endpoint type:
  - Agent creation: 100/hour per user
  - Run execution: 1000/hour per org
  - Evaluation runs: 50/hour per dataset

---

### Error Boundaries
**Status:** ❌ **NOT IMPLEMENTED**

**Missing:**
- ❌ No error.tsx files in Next.js (no route-level error boundaries)
- ❌ No React error boundaries in components
- ❌ No fallback UI for component crashes
- ❌ No error logging/monitoring

**Recommendation:**
- Add error.tsx to key routes: (authenticated), (authenticated)/agents, (authenticated)/runs
- Add ErrorBoundary wrapper to critical components
- Implement error logging (Sentry/LogRocket)

**Critical Routes Needing Error Boundaries:**
- /agents
- /agents/[id]
- /runs
- /evaluations
- /orgs

---

### Form Validation
**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Client-side:**
- ✅ HTML5 required attributes
- ❌ No pattern validation
- ❌ No custom validators
- ❌ No real-time validation feedback

**Server-side:**
- ✅ Basic required field checks
- ❌ No type validation
- ❌ No length limits
- ❌ No format validation (emails, URLs)
- ❌ No XSS/injection protection

**Example Issues:**
- Model input accepts any string
- System prompt has no length limits
- Dataset name has no uniqueness check
- Tags have no format validation

---

### Loading States
**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Implemented:**
- ✅ Agent creation form shows "Creating agent…"
- ✅ Replay button shows "Creating replay…"
- ✅ Dataset form shows loading state
- ✅ Submit buttons are disabled during requests

**Missing:**
- ❌ No page-level loading skeleton
- ❌ No progress indicators for long operations
- ❌ No "please wait" messaging
- ❌ No timeout handling (what if request hangs?)

---

### Toast/Notification System
**Status:** ❌ **NOT IMPLEMENTED**

**Missing:**
- ❌ No toast notifications
- ❌ No success messages
- ❌ No error alerts
- ❌ No warning dialogs

**Current Workaround:**
- ✅ Success uses URL redirect with query param: `?success=true`
- ✅ Errors throw server action errors
- ❌ No persistent notification system

**Recommendation:**
- Implement toast library (React Hot Toast, Sonner, etc.)
- Show success messages on creation
- Show error messages on failure
- Show warning for destructive actions

---

### Button Disabled States
**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**Implemented:**
- ✅ Submit buttons disabled during server actions
- ✅ Replay button disabled during API call
- ✅ Dataset form button disabled while saving

**Missing:**
- ❌ No visual disabled styling on all buttons
- ❌ No tooltip explaining why button is disabled
- ❌ No prevention of multiple form submissions

**Issues:**
- Not all buttons have explicit `disabled` prop
- Disabled state not always visually distinct

---

### Input Sanitization
**Status:** ❌ **NOT IMPLEMENTED**

**Missing:**
- ❌ No XSS protection on user inputs
- ❌ No HTML escaping
- ❌ No markdown sanitization
- ❌ No injection attack prevention

**Risk Areas:**
- Agent system prompts (could contain injection)
- Dataset example inputs/outputs
- Evaluation result display

---

## Summary Table: Missing Features by Category

| Category | Feature | Count | Priority |
|----------|---------|-------|----------|
| **Security** | Rate limiting | 1 | 🔴 High |
| **Security** | Input sanitization | 1 | 🔴 High |
| **UX** | Toast notifications | 1 | 🟡 Medium |
| **UX** | Error boundaries | 5+ routes | 🟡 Medium |
| **UX** | Form validation (client) | 10+ forms | 🟡 Medium |
| **Features** | Org creation UI | 1 | 🔴 High |
| **Features** | Version creation UI | 1 | 🔴 High |
| **Features** | Eval run creation UI | 1 | 🔴 High |
| **Features** | Evaluation metrics | Multiple | 🟡 Medium |
| **Features** | Bulk example import | 1 | 🟡 Medium |
| **Features** | Results export | 2+ flows | 🟡 Medium |
| **Features** | Comparison improvements | Multiple | 🟡 Medium |

---

## Test Coverage Analysis

### By Flow:
| Flow | E2E | Integration | Unit | Coverage |
|------|-----|-------------|------|----------|
| 1. Create Org | ❌ | ❌ | ❌ | 0% |
| 2. Create Agent | ✅ | ❌ | ❌ | ~30% |
| 3. Create Version | ❌ | ⚠️ | ❌ | ~20% |
| 4. Execute Agent | ✅ | ✅ | ❌ | ~60% |
| 5. Replay Run | ✅ | ✅ | ❌ | ~50% |
| 6. View Run History | ✅ | ❌ | ❌ | ~30% |
| 7. Create Dataset | ❌ | ✅ | ❌ | ~30% |
| 8. Create Eval Run | ❌ | ✅ | ❌ | ~40% |
| 9. View Results | ❌ | ❌ | ❌ | 0% |
| 10. Compare Runs | ❌ | ❌ | ❌ | 0% |

### Test Files:
- [agents.spec.ts](tests/e2e/agents.spec.ts) - Agent creation ✅
- [runs.spec.ts](tests/e2e/runs.spec.ts) - Run listing ✅
- [replay.spec.ts](tests/e2e/replay.spec.ts) - Replay ✅
- [organizations.spec.ts](tests/e2e/organizations.spec.ts) - Org listing ⚠️
- [api.spec.ts](tests/integration/api.spec.ts) - API routes ✅
- [evaluations.spec.ts](tests/integration/evaluations.spec.ts) - Eval SDK ✅
- [versioning-runtime.spec.ts](tests/integration/versioning-runtime.spec.ts) - Versioning ✅

### Missing Test Files:
- ❌ Form validation tests
- ❌ Error boundary tests
- ❌ Loading state tests
- ❌ Permission/auth failure tests
- ❌ Results viewing tests
- ❌ Comparison tests

---

## Priority Recommendations

### 🔴 HIGH PRIORITY (Do First)
1. **Add organization creation UI** - Users can't create orgs, flow blocked
2. **Add evaluation run creation UI** - Users can't create eval runs from UI
3. **Implement rate limiting** - Security risk, DoS vulnerability
4. **Add input sanitization** - XSS/injection risk on all user inputs
5. **Add org creation API endpoint** - Completes org flow

### 🟡 MEDIUM PRIORITY (Do Next)
1. **Add agent version creation UI** - Users can't see/manage versions
2. **Add form validation (client + server)** - Better UX and data integrity
3. **Implement toast notification system** - Better UX feedback
4. **Add error boundaries to key routes** - Prevent complete app crashes
5. **Add evaluation metrics UI** - Show detailed results

### 🟢 LOW PRIORITY (Nice to Have)
1. Bulk example import for datasets
2. Export results as CSV
3. Comparison statistical significance
4. Run progress tracking
5. Example detail inspector

---

## File References Summary

### Key Implementation Files:
- **Organization:** [packages/sdk/src/orgs.ts](packages/sdk/src/orgs.ts#L17), [supabase/migrations/000007_create_orgs_and_teams.sql](supabase/migrations/000007_create_orgs_and_teams.sql)
- **Agent Creation:** [apps/web/src/app/(authenticated)/agents/new/page.tsx](apps/web/src/app/(authenticated)/agents/new/page.tsx), [apps/web/src/app/api/org/[orgId]/agents/route.ts](apps/web/src/app/api/org/[orgId]/agents/route.ts)
- **Execution:** [apps/web/src/app/api/agent/run/route.ts](apps/web/src/app/api/agent/run/route.ts#L108), [apps/web/src/lib/agentExecutionAuth.ts](apps/web/src/lib/agentExecutionAuth.ts)
- **Evaluations:** [packages/sdk/src/evaluations.ts](packages/sdk/src/evaluations.ts), [apps/web/src/app/api/evaluations/datasets/route.ts](apps/web/src/app/api/evaluations/datasets/route.ts)

### Test Files:
- [tests/e2e/agents.spec.ts](tests/e2e/agents.spec.ts)
- [tests/integration/api.spec.ts](tests/integration/api.spec.ts)
- [tests/integration/evaluations.spec.ts](tests/integration/evaluations.spec.ts)

---

**Audit Completed:** June 22, 2026
**Total Flows Analyzed:** 10
**Average Flow Completion:** ~68%
**Critical Blockers:** 2 (Org creation UI, Eval run UI)
**Security Issues:** 2 (Rate limiting, Input sanitization)
