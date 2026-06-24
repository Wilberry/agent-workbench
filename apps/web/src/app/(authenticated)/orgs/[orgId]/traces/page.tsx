import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns } from '@agent-workbench/sdk';
import OrgTraceAnalytics from '@/components/OrgTraceAnalytics';

type AgentRun = Database['public']['Tables']['agent_runs']['Row'];

type TracePoint = {
  id: string;
  label: string;
  steps: number;
  tokens: number;
  createdAt: string;
};

export default async function OrgTraceExplorerPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const orgRunsData = await agentRuns.listOrgRuns(params.orgId, 50, supabase);

  if (!orgRunsData) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">
        Could not load organization traces.
      </div>
    );
  }

  const orgRuns = (orgRunsData ?? []) as AgentRun[];
  const totalRuns = orgRuns.length;
  const statusCounts = orgRuns.reduce(
    (counts, run) => {
      counts[run.status] += 1;
      return counts;
    },
    { pending: 0, running: 0, completed: 0, failed: 0 }
  );

  const tracePoints: TracePoint[] = orgRuns
    .slice(0, 10)
    .map((run) => {
      const trace = run.execution_trace ?? [];
      const steps = trace.length;
      const tokens = trace.reduce((sum: number, step: any) => sum + (step?.metadata?.tokens ?? 0), 0);
      return {
        id: run.id,
        label: run.id.slice(0, 8),
        steps,
        tokens,
        createdAt: run.created_at
      };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const maxSteps = Math.max(...tracePoints.map((point) => point.steps), 1);
  const totalTokens = orgRuns.reduce(
    (sum, run) => sum + ((run.execution_trace ?? []).reduce((inner: number, step: any) => inner + (step?.metadata?.tokens ?? 0), 0) ?? 0),
    0
  );
  const totalSteps = orgRuns.reduce((sum: number, run: any) => sum + (run.execution_trace ?? []).length, 0);
  const averageSteps = totalRuns ? Math.round(totalSteps / totalRuns) : 0;
  const averageTokens = totalRuns ? Math.round(totalTokens / totalRuns) : 0;
  const uniqueTools = Array.from(
    new Set(
      orgRuns
        .flatMap((run) => (run.execution_trace ?? []).flatMap((step: any) => (step?.metadata?.toolName ? [step.metadata.toolName] : [])))
        .filter(Boolean)
    )
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <OrgTraceAnalytics orgId={params.orgId} runs={orgRuns} />

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Organization run traces</h2>
            <span className="text-sm text-slate-400">Most recent runs with trace metadata</span>
          </div>

          <div className="mt-6 space-y-3">
            {orgRuns.length === 0 ? (
              <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">No organization runs available.</div>
            ) : (
              orgRuns.map((run) => {
                const trace = run.execution_trace ?? [];
                const tokens = trace.reduce((sum: number, step: any) => sum + (step?.metadata?.tokens ?? 0), 0);
                const tools = Array.from(
                  new Set(
                    trace.flatMap((step: any) => (step?.metadata?.toolName ? [step.metadata.toolName] : [])).filter(Boolean)
                  )
                );

                return (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="block rounded-3xl border border-slate-700 bg-slate-950 p-4 transition hover:border-emerald-500 hover:bg-slate-900"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white">Run {run.id.slice(0, 8)}</span>
                          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{run.status}</span>
                        </div>
                        <div className="text-sm text-slate-400">Workflow: {run.workflow?.join(' → ') ?? 'N/A'}</div>
                      </div>
                      <div className="grid gap-2 sm:text-right text-sm text-slate-300">
                        <div>{new Date(run.created_at).toLocaleString()}</div>
                        <div>{trace.length} trace steps</div>
                        <div>{tokens} tokens</div>
                        <div>{tools.length > 0 ? tools.join(', ') : 'No tools'}</div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

