import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationRunSummaryCard from '@/components/evaluations/EvaluationRunSummaryCard';
import EvaluationStatusBadge from '@/components/evaluations/EvaluationStatusBadge';
import EvaluationAnalytics from '@/components/EvaluationAnalytics';
import type { EvaluationDataset, EvaluationRun } from '@agent-workbench/sdk';

export default async function EvaluationsDashboardPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const [datasetsRes, runsRes, examplesRes] = await Promise.all([
    supabase
      .from('evaluation_datasets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('evaluation_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50), // Increased from 8 to 50 for better trend analysis with ~30+ data points per version
    supabase.from('evaluation_dataset_examples').select('dataset_id')
  ]);

  const datasets = (datasetsRes.data ?? []) as EvaluationDataset[];
  const runs = (runsRes.data ?? []) as EvaluationRun[];
  const exampleRows = examplesRes.data ?? [];

  const exampleCounts = exampleRows.reduce<Record<string, number>>((acc, example) => {
    if (!example?.dataset_id) return acc;
    acc[example.dataset_id] = (acc[example.dataset_id] ?? 0) + 1;
    return acc;
  }, {});

  const runCounts = runs.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status as 'completed' | 'running' | 'pending' | 'failed'] += 1;
      if (item.status === 'completed' && item.summary?.exact_match_rate != null) {
        acc.completedRateTotal += Number(item.summary.exact_match_rate);
      }
      return acc;
    },
    { total: 0, completed: 0, running: 0, pending: 0, failed: 0, completedRateTotal: 0 }
  );

  const successRate = runCounts.completed ? runCounts.completedRateTotal / runCounts.completed : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Evaluation dashboard</h1>
              <p className="mt-2 text-slate-400">Monitor datasets, runs, and evaluation health in one place.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={{ pathname: '/evaluations/datasets' }} className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
                View datasets
              </Link>
              <Link href={{ pathname: '/evaluations/runs' }} className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
                View runs
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <EvaluationRunSummaryCard
              title="Datasets"
              subtitle="Recent dataset count"
              metricLabel="Datasets"
              metricValue={datasets.length}
              details={`${Object.values(exampleCounts).reduce((sum, count) => sum + count, 0)} dataset examples`}
            />
            <EvaluationRunSummaryCard
              title="Evaluation runs"
              subtitle="Recent run activity"
              metricLabel="Recent runs"
              metricValue={runs.length}
              details={`${runCounts.completed} completed`}
            />
            <EvaluationRunSummaryCard
              title="Success rate"
              subtitle="Average exact match"
              metricLabel="Success"
              metricValue={`${(successRate * 100).toFixed(1)}%`}
            />
            <EvaluationRunSummaryCard
              title="Failure rate"
              subtitle="Recent run failures"
              metricLabel="Failed"
              metricValue={runCounts.failed}
              details={`${runCounts.pending} pending / ${runCounts.running} running`}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Recent datasets</h2>
                <p className="text-sm text-slate-400">Latest created datasets with example counts.</p>
              </div>
              <Link href={{ pathname: '/evaluations/datasets' }} className="text-sm text-emerald-300 hover:text-emerald-200">
                View all
              </Link>
            </div>
            <div className="mt-6 space-y-4">
              {datasets.length === 0 ? (
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-400">No datasets yet.</div>
              ) : (
                datasets.map((dataset) => (
                  <Link
                    key={dataset.id}
                    href={{ pathname: '/evaluations/datasets/[datasetId]', query: { datasetId: dataset.id } }}
                    className="block rounded-3xl border border-slate-700 bg-slate-950 p-4 hover:border-emerald-500"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">{dataset.name}</div>
                        <div className="text-sm text-slate-400">{dataset.description ?? 'No description'}</div>
                      </div>
                      <span className="text-sm text-slate-400">{exampleCounts[dataset.id] ?? 0} examples</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dataset.tags.map((tag: string) => (
                        <span key={tag} className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Recent runs</h2>
                <p className="text-sm text-slate-400">Latest evaluation executions and statuses.</p>
              </div>
              <Link href={{ pathname: '/evaluations/runs' }} className="text-sm text-emerald-300 hover:text-emerald-200">
                View all
              </Link>
            </div>
            <div className="mt-6 space-y-3">
              {runs.length === 0 ? (
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-400">No runs yet.</div>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-semibold text-white">Run {run.id.slice(0, 8)}</div>
                        <div className="text-sm text-slate-400">Created {new Date(run.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <EvaluationStatusBadge status={run.status} />
                        <Link
                          href={{ pathname: '/evaluations/runs/[runId]', query: { runId: run.id } }}
                          className="text-sm text-emerald-300 hover:text-emerald-200"
                        >
                          Details →
                        </Link>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="text-sm text-slate-400">Dataset {run.dataset_id.slice(0, 8)}</div>
                      <div className="text-sm text-slate-400">Version {run.agent_version_id.slice(0, 8)}</div>
                      <div className="text-sm text-slate-400">Summary {run.summary?.exact_match_rate != null ? `${(Number(run.summary.exact_match_rate) * 100).toFixed(1)}%` : 'Pending'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Evaluation Analytics</h2>
        <EvaluationAnalytics runs={runs} />
      </div>
    </main>
  );
}
