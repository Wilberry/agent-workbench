import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns } from '@agent-workbench/sdk';
import RunDetailClient from '../../../../components/RunDetailClient';

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
          <div className="mb-4 flex items-center justify-between">
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
            <span
              className={`inline-block rounded-full px-4 py-2 text-lg font-semibold ${
                statusColors[run.status as keyof typeof statusColors] || 'bg-slate-700 text-slate-100'
              }`}
            >
              {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
            </span>
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
          <h2 className="text-xl font-semibold">Execution Timeline</h2>

          {trace.length === 0 ? (
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
              No steps executed yet.
            </div>
          ) : (
            trace.map((step) => (
              <details
                key={step.id}
                className="rounded-2xl border border-slate-700 bg-slate-900"
                open={trace.length === 1}
              >
                <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-emerald-400">{step.step}</span>
                      {step.status === 'failed' && (
                        <span className="ml-2 inline-block rounded bg-red-900 px-2 py-1 text-xs text-red-100">
                          Failed
                        </span>
                      )}
                      {step.status === 'completed' && (
                        <span className="ml-2 inline-block rounded bg-emerald-900 px-2 py-1 text-xs text-emerald-100">
                          Completed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </summary>

                <div className="space-y-3 border-t border-slate-700 px-4 py-3">
                  {step.input && (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-slate-300">Input:</div>
                      <div className="rounded bg-slate-950 p-2 text-sm text-slate-100">{step.input}</div>
                    </div>
                  )}

                  {step.output && (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-slate-300">Output:</div>
                      <div className="rounded bg-slate-950 p-2 text-sm text-slate-100 whitespace-pre-wrap">
                        {step.output}
                      </div>
                    </div>
                  )}

                  {step.error && (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-red-400">Error:</div>
                      <div className="rounded bg-red-950 p-2 text-sm text-red-100">{step.error}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>
                      <div className="font-semibold">Tool called:</div>
                      <div>{step.metadata?.toolName ?? 'None'}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Tokens:</div>
                      <div>{step.metadata?.tokens ?? 'N/A'}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Memory used:</div>
                      <div>{step.metadata?.model ? 'Yes' : 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Status:</div>
                      <div>{step.status || 'pending'}</div>
                    </div>
                  </div>
                </div>
              </details>
            ))
          )}
          <div className="mt-4">
            <RunDetailClient runId={run.id} initialTrace={trace} initialStatus={run.status} />
          </div>
        </div>
      </div>
    </main>
  );
}

