import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns } from '@agent-workbench/sdk';
import type { AgentRunStatus } from '@agent-workbench/sdk';

type AgentRun = {
  id: string;
  user_id: string;
  conversation_id: string;
  workflow: string[];
  current_step: number;
  execution_trace: Array<{
    metadata?: { toolName?: string; tokens?: number } | null;
  }>;
  model_name?: string | null;
  total_tokens: number;
  estimated_cost: number;
  latency_ms: number;
  status: AgentRunStatus;
  created_at: string;
};

type SearchParams = {
  status?: string;
  tool?: string;
  q?: string;
};

export default async function TraceExplorerPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const runs = await agentRuns.listByUser(user.id, 100);

  const statusFilter = searchParams?.status ?? '';
  const toolFilter = searchParams?.tool ?? '';
  const query = (searchParams?.q ?? '').trim().toLowerCase();

  const statusColors = {
    pending: 'bg-yellow-900 text-yellow-100',
    running: 'bg-blue-900 text-blue-100',
    completed: 'bg-emerald-900 text-emerald-100',
    failed: 'bg-red-900 text-red-100',
    cancelled: 'bg-slate-700 text-slate-200'
  } satisfies Record<AgentRunStatus, string>;

  const tools = Array.from(
    new Set(
      runs
        .flatMap((run) =>
          (run.execution_trace || [])
            .flatMap((step) => (step.metadata?.toolName ? [step.metadata.toolName] : []))
            .filter(Boolean)
        )
        .filter(Boolean)
    )
  ).sort() as string[];

  const filteredRuns = runs.filter((run) => {
    const trace = run.execution_trace || [];
    const runTools = trace
      .flatMap((step) => (step.metadata?.toolName ? [step.metadata.toolName] : []))
      .filter(Boolean);

    const matchesStatus = !statusFilter || run.status === statusFilter;
    const matchesTool = !toolFilter || runTools.includes(toolFilter);
    const matchesQuery =
      !query ||
      run.id.toLowerCase().includes(query) ||
      run.workflow.some((item) => item.toLowerCase().includes(query));

    return matchesStatus && matchesTool && matchesQuery;
  });

  const runSummaries = filteredRuns.map((run: AgentRun) => {
    const trace = run.execution_trace || [];
    const toolNames = Array.from(
      new Set(
        trace
          .flatMap((step) => (step.metadata?.toolName ? [step.metadata.toolName] : []))
          .filter(Boolean)
      )
    );
    const tokenCount = trace.reduce((sum, step) => sum + (step.metadata?.tokens ?? 0), 0);

    return {
      ...run,
      steps: trace.length,
      tools: toolNames,
      modelIterations: tokenCount
    };
  });

  const totalSteps = runSummaries.reduce((sum, run) => sum + run.steps, 0);
  const totalTokens = runSummaries.reduce((sum, run) => sum + run.modelIterations, 0);
  const averageTokens = runSummaries.length ? Math.round(totalTokens / runSummaries.length) : 0;
  const averageSteps = runSummaries.length ? Math.round(totalSteps / runSummaries.length) : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Trace Explorer</h1>
              <p className="mt-2 text-slate-400">Review agent run traces and tool usage across your workflows.</p>
            </div>
            <Link
              href="/runs"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              View run history
            </Link>
          </div>

          <form method="get" className="mt-6 grid gap-4 sm:grid-cols-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Status</span>
              <select
                name="status"
                defaultValue={statusFilter}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Tool</span>
              <select
                name="tool"
                defaultValue={toolFilter}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              >
                <option value="">Any tool</option>
                {tools.map((tool) => (
                  <option key={tool} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-slate-200">Search</span>
              <input
                type="search"
                name="q"
                defaultValue={searchParams?.q ?? ''}
                placeholder="Search run IDs or workflow names"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              />
            </label>

            <div className="sm:col-span-4 flex flex-wrap items-end gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Apply filters
              </button>
              <Link
                href="/traces"
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-emerald-500"
              >
                Clear filters
              </Link>
            </div>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
          Showing <span className="font-semibold text-white">{runSummaries.length}</span> of <span className="font-semibold text-white">{runs.length}</span> runs.
        </div>

        {runSummaries.length === 0 ? (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
            No run traces found yet. Start a conversation with an agent to collect trace data.
          </div>
        ) : (
          <div className="space-y-4">
            {runSummaries.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="block rounded-3xl border border-slate-700 bg-slate-900 p-6 transition hover:border-emerald-500 hover:bg-slate-800"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xl font-semibold text-slate-100">Run {run.id.slice(0, 8)}</span>
                      <span className="text-sm text-slate-400">Workflow: {run.workflow.join(' → ')}</span>
                    </div>
                    <div className="text-sm text-slate-400">Created {new Date(run.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${statusColors[run.status]}`}>
                      {run.status}
                    </span>
                    <span className="rounded-2xl bg-slate-950 px-3 py-1 text-sm text-slate-300">{run.steps} steps</span>
                    <span className="rounded-2xl bg-slate-950 px-3 py-1 text-sm text-slate-300">{run.tools.length || 0} tools</span>
                    <span className="rounded-2xl bg-slate-950 px-3 py-1 text-sm text-slate-300">{run.total_tokens} tokens</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Model</div>
                    <div className="mt-2 text-slate-100">{run.model_name ?? 'Unknown'}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Total tokens</div>
                    <div className="mt-2 text-slate-100">{run.total_tokens}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Estimated cost</div>
                    <div className="mt-2 text-slate-100">${run.estimated_cost.toFixed(4)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Latency</div>
                    <div className="mt-2 text-slate-100">{run.latency_ms}ms</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Current step</div>
                    <div className="mt-2 text-lg font-semibold text-white">{run.current_step} / {run.workflow.length}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Tools used</div>
                    <div className="mt-2 text-slate-200">{run.tools.length > 0 ? run.tools.join(', ') : 'None'}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
                    <div className="font-semibold text-slate-300">Trace length</div>
                    <div className="mt-2 text-lg font-semibold text-white">{run.steps}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
