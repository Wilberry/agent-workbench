import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationStatusBadge from '@/components/evaluations/EvaluationStatusBadge';
import type { EvaluationRun, EvaluationDataset } from '@agent-workbench/sdk';

export default async function EvaluationsRunsPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const [runsRes, datasetsRes, versionsRes] = await Promise.all([
    supabase.from('evaluation_runs').select('*').order('created_at', { ascending: false }),
    supabase.from('evaluation_datasets').select('id,name'),
    supabase.from('agent_versions').select('id,version')
  ]);

  const runs = (runsRes.data ?? []) as EvaluationRun[];
  const datasets = (datasetsRes.data ?? []) as Array<{ id: string; name: string }>;
  const versions = (versionsRes.data ?? []) as Array<{ id: string; version: string }>;

  const datasetMap = datasets.reduce<Record<string, string>>((acc, dataset) => {
    acc[dataset.id] = dataset.name;
    return acc;
  }, {});

  const versionMap = versions.reduce<Record<string, string>>((acc, version) => {
    acc[version.id] = version.version;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Evaluation runs</h1>
            <p className="mt-2 text-slate-400">Browse all evaluation executions and status details.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={{ pathname: '/evaluations' }}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Dashboard
            </Link>
            <Link
              href={{ pathname: '/evaluations/compare' }}
              className="rounded-2xl border border-slate-700 bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
            >
              Compare runs
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900">
          <div className="grid grid-cols-6 gap-4 border-b border-slate-700 bg-slate-950 px-6 py-4 text-xs uppercase tracking-[0.2em] text-slate-500">
            <div className="col-span-2">Run</div>
            <div>Dataset</div>
            <div>Version</div>
            <div>Score</div>
            <div>Status</div>
          </div>
          <div className="divide-y divide-slate-700">
            {runs.length === 0 ? (
              <div className="p-6 text-center text-slate-400">No evaluation runs available.</div>
            ) : (
              runs.map((run) => {
                const scoreLabel = run.summary?.exact_match_rate != null ? `${(Number(run.summary.exact_match_rate) * 100).toFixed(1)}%` : 'Pending';
                const datasetName = datasetMap[run.dataset_id] ?? run.dataset_id.slice(0, 8);
                const versionText = versionMap[run.agent_version_id] ?? run.agent_version_id.slice(0, 8);
                return (
                  <Link
                    key={run.id}
                    href={{ pathname: '/evaluations/runs/[runId]', query: { runId: run.id } }}
                    className="grid grid-cols-6 gap-4 px-6 py-5 transition hover:bg-slate-950 sm:px-8"
                  >
                    <div className="col-span-2 space-y-1">
                      <div className="font-semibold text-white">Run {run.id.slice(0, 8)}</div>
                      <div className="text-sm text-slate-400">{new Date(run.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-sm text-slate-300">{datasetName}</div>
                    <div className="text-sm text-slate-300">{versionText}</div>
                    <div className="text-sm text-slate-300">{scoreLabel}</div>
                    <div>
                      <EvaluationStatusBadge status={run.status} />
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
