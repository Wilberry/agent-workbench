import React from 'react';
import type { Database } from '@/types/database';

type AgentRun = Database['public']['Tables']['agent_runs']['Row'];

export default function OrgTraceAnalytics({ orgId, runs }: { orgId: string; runs: AgentRun[] }) {
  const orgRuns = runs ?? [];
  const totalRuns = orgRuns.length;

  const statusCounts = orgRuns.reduce(
    (acc, run) => {
      acc[run.status] = (acc[run.status] ?? 0) + 1;
      return acc;
    },
    { pending: 0, running: 0, completed: 0, failed: 0 } as Record<string, number>
  );

  const traceSeries = orgRuns
    .map((run) => {
      const steps = (run.execution_trace ?? []).length;
      const tokens = (run.execution_trace ?? []).reduce((s: number, st: any) => s + (st?.metadata?.tokens ?? 0), 0);
      return { id: run.id, label: run.id.slice(0, 8), steps, tokens, createdAt: run.created_at };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-10);

  const maxSteps = Math.max(...traceSeries.map((t) => t.steps), 1);
  const totalTokens = orgRuns.reduce(
    (sum, run) => sum + ((run.execution_trace ?? []).reduce((inner: number, s: any) => inner + (s?.metadata?.tokens ?? 0), 0) ?? 0),
    0
  );
  const averageSteps = traceSeries.length ? Math.round(traceSeries.reduce((s, r) => s + r.steps, 0) / traceSeries.length) : 0;

  const toolNames = Array.from(
    new Set(
      orgRuns
        .flatMap((run) => (run.execution_trace ?? []).flatMap((s: any) => (s?.metadata?.toolName ? [s.metadata.toolName] : [])))
        .filter(Boolean)
    )
  );

  return (
    <div>
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Organization Trace Analytics</h3>
            <p className="mt-1 text-sm text-slate-400">Overview of recent trace activity for this organization.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-3xl bg-slate-950 p-3 text-center">
              <div className="text-sm text-slate-400">Total runs</div>
              <div className="mt-1 text-2xl font-semibold text-white">{totalRuns}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-3 text-center">
              <div className="text-sm text-slate-400">Avg. steps</div>
              <div className="mt-1 text-2xl font-semibold text-white">{averageSteps}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-3 text-center">
              <div className="text-sm text-slate-400">Total tokens</div>
              <div className="mt-1 text-2xl font-semibold text-white">{totalTokens}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-3 text-center">
              <div className="text-sm text-slate-400">Unique tools</div>
              <div className="mt-1 text-2xl font-semibold text-white">{toolNames.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.6fr]">
          <div className="rounded-3xl bg-slate-950 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-300">Recent trace lengths</div>
              <div className="text-xs text-slate-400">Last {traceSeries.length}</div>
            </div>
            <div className="mt-4 space-y-3">
              {traceSeries.length === 0 ? (
                <div className="text-sm text-slate-400">No recent traces.</div>
              ) : (
                traceSeries.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>{p.label}</span>
                      <span>{p.steps} steps</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-900">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((p.steps / maxSteps) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-slate-950 p-4">
            <div className="text-sm text-slate-300">Status breakdown</div>
            <div className="mt-4 space-y-3">
              {(['completed', 'running', 'pending', 'failed'] as const).map((s) => (
                <div key={s} className="text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="capitalize">{s}</span>
                    <span className="font-semibold text-white">{statusCounts[s]}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${s === 'completed' ? 'bg-emerald-500' : s === 'running' ? 'bg-blue-500' : s === 'pending' ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${totalRuns ? Math.round((statusCounts[s] / totalRuns) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
