import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns, agents } from '@agent-workbench/sdk';
import RunDetailLive from '../../../../components/RunDetailLive';
import RunReplayActions from '@/components/RunReplayActions';

type Params = {
  params: {
    runId: string;
  };
};

type AgentRun = {
  id: string;
  user_id: string;
  conversation_id: string;
  workflow: string[];
  current_step: number;
  execution_trace: Array<{
    id: string;
    run_id?: string;
    step: string;
    status: string;
    input?: any;
    output?: any;
    error?: string;
    timestamp: string;
    metadata?: { model?: string; tokens?: number; toolName?: string } | null;
  }>;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  latency_ms: number;
  model_name?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string | null;
  created_at: string;
};

export default async function RunDetailPage({ params }: Params) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const run = await agentRuns.get(params.runId);

  if (!run || run.user_id !== user.id) {
    return <div className="p-6 text-red-400">Run not found or access denied.</div>;
  }

  const statusColors = {
    pending: 'bg-yellow-900 text-yellow-100',
    running: 'bg-blue-900 text-blue-100',
    completed: 'bg-emerald-900 text-emerald-100',
    failed: 'bg-red-900 text-red-100'
  };

  const trace = (run.execution_trace as AgentRun['execution_trace']) || [];

  // Execution summary metrics
  const stepCount = trace.length;
  const toolCallCount = trace.flatMap((s) => (s.metadata?.toolName ? [s.metadata.toolName] : [])).length;
  const traceEventCount = trace.length;
  const completionPct = run.workflow && (run.workflow as string[]).length > 0 ? Math.round((run.current_step / (run.workflow as string[]).length) * 100) : 0;

  // Failure diagnostics
  const failedStep = trace.find((s) => s.status === 'failed');

  // Replay history / retry count (look up recent runs for this user and count replays pointing to this run)
  const userRuns = await agentRuns.listByUser(user.id, 200, supabase);
  const replayHistory = (userRuns ?? []).filter((r: any) => r.replay_of_run_id === run.id);
  const retryCount = replayHistory.length;

  // Latest agent version id (if available)
  let latestVersionId: string | null = null;
  try {
    if (run.agent_version_id) {
      const ver = await agents.getVersion(run.agent_version_id as string);
      if (ver?.agent_id) {
        const latest = await agents.getLatestVersion(ver.agent_id);
        latestVersionId = latest?.id ?? null;
      }
    }
  } catch (e) {
    // ignore failures to fetch versions
    latestVersionId = null;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/runs"
              className="text-slate-400 transition hover:text-slate-100"
            >
              ← Back to runs
            </Link>
            <Link
              href={`/runs/${run.id}/replay`}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Replay run
            </Link>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
            <div>Workflow: {(run.workflow as string[]).join(' → ')}</div>
            <div>Step {run.current_step} / {(run.workflow as string[]).length}</div>
            <div>Status: {run.status}</div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Workflow Execution</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {(run.workflow as string[]).map((role) => (
                  <span
                    key={role}
                    className="inline-block rounded bg-slate-700 px-3 py-1 text-sm text-slate-100"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`inline-block rounded-full px-4 py-2 text-lg font-semibold ${
                  statusColors[run.status as keyof typeof statusColors] || 'bg-slate-700 text-slate-100'
                }`}
              >
                {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
              </span>
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
                <div>Run Overview</div>
                <div className="mt-1 text-xs text-slate-400">
                  Model: <span className="text-white">{run.model_name ?? 'Unknown'}</span>
                </div>
                <div className="text-xs text-slate-400">Tokens: <span className="text-white">{run.total_tokens ?? 0}</span></div>
                <div className="text-xs text-slate-400">Est. cost: <span className="text-white">${(run.estimated_cost ?? 0).toFixed(4)}</span></div>
                <div className="text-xs text-slate-400">Latency: <span className="text-white">{run.latency_ms ?? 0}ms</span></div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold text-slate-300">Created</div>
              <div className="text-slate-400">{new Date(run.created_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-300">Progress</div>
              <div className="text-slate-400">
                Step {run.current_step} / {(run.workflow as string[]).length}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Model used</div>
              <div className="mt-2 text-xl font-semibold text-white">{run.model_name ?? 'Unknown'}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Total tokens</div>
              <div className="mt-2 text-xl font-semibold text-white">{run.total_tokens}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Estimated cost</div>
              <div className="mt-2 text-xl font-semibold text-white">${run.estimated_cost.toFixed(4)}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Input tokens</div>
              <div className="mt-2 text-xl font-semibold text-white">{run.input_tokens}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Output tokens</div>
              <div className="mt-2 text-xl font-semibold text-white">{run.output_tokens}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Latency</div>
              <div className="mt-2 text-xl font-semibold text-white">{run.latency_ms}ms</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Step count</div>
              <div className="mt-2 text-xl font-semibold text-white">{stepCount}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Tool calls</div>
              <div className="mt-2 text-xl font-semibold text-white">{toolCallCount}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Trace events</div>
              <div className="mt-2 text-xl font-semibold text-white">{traceEventCount}</div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Execution summary</div>
                <div className="mt-1 text-white font-semibold">Completion: {completionPct}%</div>
              </div>
              <div className="w-1/3">
                <div className="h-2 rounded bg-slate-800">
                  <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, completionPct)}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Actions</h3>
              <div className="mt-3">
                <RunReplayActions runId={run.id} latestVersionId={latestVersionId} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-200">Failure diagnostics</h3>
              <div className="mt-3 text-sm text-slate-300">
                {run.error_message ? (
                  <div className="rounded-lg border border-red-700 bg-red-950/20 p-3">
                    <div className="font-semibold text-red-200">Error</div>
                    <div className="text-sm text-red-100 mt-1">{run.error_message}</div>
                  </div>
                ) : (
                  <div className="text-slate-400">No top-level error.</div>
                )}

                <div className="mt-3">
                  <div className="text-xs text-slate-400">Failed step</div>
                  <div className="text-sm text-white">{failedStep ? failedStep.step : 'None'}</div>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-slate-400">Retry count</div>
                  <div className="text-sm text-white">{retryCount}</div>
                </div>
                {retryCount > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-slate-400">Replay history</div>
                    <div className="mt-2 space-y-2">
                      {replayHistory.map((r: any) => (
                        <Link key={r.id} href={`/runs/${r.id}`} className="block text-sm text-emerald-300 hover:underline">
                          Replay {r.id.slice(0, 8)} — {r.status}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {run.error_message && (
            <div className="mt-4 rounded-2xl bg-red-950 p-4">
              <div className="font-semibold text-red-100">Error</div>
              <div className="mt-1 text-sm text-red-200">{run.error_message}</div>
            </div>
          )}

          {run.replay_of_run_id && (
            <div className="mt-4 rounded-2xl border border-blue-700 bg-blue-950/30 p-4">
              <div className="font-semibold text-blue-100">This is a replay</div>
              <div className="mt-1 text-sm text-blue-200">
                {run.replay_reason}
                <br />
                <Link
                  href={`/runs/${run.replay_of_run_id}`}
                  className="mt-2 inline-block rounded border border-blue-600 px-2 py-1 text-xs hover:bg-blue-900"
                >
                  View original run →
                </Link>
              </div>
            </div>
          )}
        </div>

        {run.status === 'completed' && (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">Replay Options</h2>
            <p className="mb-4 text-sm text-slate-400">
              Create a new run using a different agent version to test improvements or changes.
            </p>
            <Link
              href={`/runs/${run.id}/replay`}
              className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Create replay run
            </Link>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Execution Timeline (Live)</h2>

          <div className="mt-4">
            <RunDetailLive runId={run.id} initialRun={run} initialTrace={trace} />
          </div>
        </div>
      </div>
    </main>
  );
}

