import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
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
    stepIndex: number;
    agentRole: string;
    input: string;
    output: string;
    toolsCalled: string[];
    memoryUsed: boolean;
    timestamp: string;
    modelIterations: number;
    status?: string;
    error?: string;
  }>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string | null;
  created_at: string;
};

export default async function RunDetailPage({ params }: Params) {
  const supabase = createServerComponentClient<Database>({ cookies });
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
        <div className="flex items-center space-x-3">
          <Link
            href="/runs"
            className="text-slate-400 transition hover:text-slate-100"
          >
            ← Back to runs
          </Link>
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

          {run.error_message && (
            <div className="mt-4 rounded-2xl bg-red-950 p-4">
              <div className="font-semibold text-red-100">Error</div>
              <div className="mt-1 text-sm text-red-200">{run.error_message}</div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Execution Timeline</h2>

          {trace.length === 0 ? (
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
              No steps executed yet.
            </div>
          ) : (
            trace.map((step) => (
              <details
                key={step.stepIndex}
                className="rounded-2xl border border-slate-700 bg-slate-900"
                open={trace.length === 1}
              >
                <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-emerald-400">{step.agentRole}</span>
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
                      <div className="font-semibold">Tools:</div>
                      <div>{step.toolsCalled.length > 0 ? step.toolsCalled.join(', ') : 'None'}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Iterations:</div>
                      <div>{step.modelIterations}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Memory used:</div>
                      <div>{step.memoryUsed ? 'Yes' : 'No'}</div>
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
          {/* Client component subscribes to realtime updates and renders timeline */}
          <div>
            {/* @ts-ignore - Client component import */}
            {/* eslint-disable-next-line @next/next/no-typos */}
            <script />
          </div>
          <div className="mt-4">
            {/* Render client-side detail component */}
            {/* eslint-disable-next-line react/jsx-no-undef */}
            <RunDetailClient runId={run.id} initialTrace={trace} initialStatus={run.status} />
          </div>
        </div>
      </div>
    </main>
  );
}
