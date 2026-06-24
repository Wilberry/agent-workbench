import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationAnalytics from '@/components/EvaluationAnalytics';
import ExperimentHistory from '@/components/experiments/ExperimentHistory';
import { agents, evaluations, experiments } from '@agent-workbench/sdk';
import type { EvaluationDataset, EvaluationRun } from '@agent-workbench/sdk';

function formatPercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function ExperimentsPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const [datasets, runs, versions, experimentsList, exampleCounts] = await Promise.all([
    evaluations.listDatasets(undefined, undefined, supabase),
    evaluations.listEvaluationRuns({ limit: 50 }, supabase),
    agents.listAllVersions(supabase),
    experiments.listExperiments(undefined, undefined, supabase),
    evaluations.listDatasetExampleCounts(supabase)
  ]);

  const datasetsList = datasets as EvaluationDataset[];
  const runsList = runs as EvaluationRun[];
  const versionsList = versions as Array<{ id: string; version: string }>;
  const experimentsArray = experimentsList as Array<any>;

  const completedRuns = runs.filter((run) => run.status === 'completed');
  const overallPassRate = completedRuns.length
    ? completedRuns.reduce((sum, run) => sum + Number(run.summary?.exact_match_rate ?? 0), 0) / completedRuns.length
    : 0;

  const datasetMap = datasets.reduce<Record<string, string>>((acc, dataset) => {
    acc[dataset.id] = dataset.name;
    return acc;
  }, {});

  const versionMap = versions.reduce<Record<string, string>>((acc, version) => {
    acc[version.id] = version.version;
    return acc;
  }, {});

  const datasetMetrics = runs.reduce((acc: Record<string, { runCount: number; completed: number; passRateTotal: number }>, run) => {
    if (!acc[run.dataset_id]) acc[run.dataset_id] = { runCount: 0, completed: 0, passRateTotal: 0 };
    acc[run.dataset_id].runCount += 1;
    if (run.status === 'completed') {
      acc[run.dataset_id].completed += 1;
      acc[run.dataset_id].passRateTotal += Number(run.summary?.exact_match_rate ?? 0);
    }
    return acc;
  }, {});

  const topDatasets = Object.entries(datasetMetrics)
    .map(([datasetId, metric]) => ({
      id: datasetId,
      name: datasetMap[datasetId] ?? datasetId.slice(0, 8),
      runCount: metric.runCount,
      passRate: metric.completed > 0 ? metric.passRateTotal / metric.completed : 0
    }))
    .sort((a, b) => b.runCount - a.runCount)
    .slice(0, 3);

  const versionMetrics = runs.reduce((acc: Record<string, { runCount: number; completed: number; passRateTotal: number }>, run) => {
    if (!acc[run.agent_version_id]) acc[run.agent_version_id] = { runCount: 0, completed: 0, passRateTotal: 0 };
    acc[run.agent_version_id].runCount += 1;
    if (run.status === 'completed') {
      acc[run.agent_version_id].completed += 1;
      acc[run.agent_version_id].passRateTotal += Number(run.summary?.exact_match_rate ?? 0);
    }
    return acc;
  }, {});

  const topVersions = Object.entries(versionMetrics)
    .map(([versionId, metric]) => ({
      id: versionId,
      version: versionMap[versionId] ?? versionId.slice(0, 8),
      runCount: metric.runCount,
      passRate: metric.completed > 0 ? metric.passRateTotal / metric.completed : 0
    }))
    .sort((a, b) => b.passRate - a.passRate)
    .slice(0, 4);

  const recentRuns = runs.slice(0, 8);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Experimentation Suite</h1>
              <p className="mt-2 text-slate-400">Run A/B comparisons, benchmark agent versions, and monitor experiment outcomes from a single workspace.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/experiments/new"
                className="rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
              >
                Create experiment
              </Link>
              <Link
                href="/evaluations"
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
              >
                Open evaluation dashboard
              </Link>
              <Link
                href="/evaluations/compare"
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
              >
                Compare runs
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-5">
              <div className="text-sm text-slate-400">Datasets</div>
              <div className="mt-3 text-3xl font-semibold text-white">{datasets.length}</div>
              <div className="mt-2 text-sm text-slate-500">Experiment datasets available</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-5">
              <div className="text-sm text-slate-400">Experiment runs</div>
              <div className="mt-3 text-3xl font-semibold text-white">{runs.length}</div>
              <div className="mt-2 text-sm text-slate-500">Recent evaluation executions</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-5">
              <div className="text-sm text-slate-400">Versions tested</div>
              <div className="mt-3 text-3xl font-semibold text-white">{new Set(runs.map((run) => run.agent_version_id)).size}</div>
              <div className="mt-2 text-sm text-slate-500">Distinct agent versions</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-5">
              <div className="text-sm text-slate-400">Overall pass rate</div>
              <div className="mt-3 text-3xl font-semibold text-emerald-400">{formatPercentage(overallPassRate)}</div>
              <div className="mt-2 text-sm text-slate-500">Completed experiment success</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Top datasets</h2>
            <p className="mt-2 text-sm text-slate-400">Most active evaluation datasets and their pass rates.</p>
            <div className="mt-6 space-y-4">
              {topDatasets.length === 0 ? (
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-slate-400">No dataset experiments yet.</div>
              ) : (
                topDatasets.map((dataset) => (
                  <div key={dataset.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">{dataset.name}</div>
                        <div className="text-sm text-slate-400">{dataset.runCount} runs</div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-400">{formatPercentage(dataset.passRate)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 text-right">
              <Link href="/evaluations/datasets" className="text-sm text-emerald-300 hover:text-emerald-200">
                Manage datasets →
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Top version experiments</h2>
            <p className="mt-2 text-sm text-slate-400">Agent versions with the strongest evaluation results.</p>
            <div className="mt-6 space-y-4">
              {topVersions.length === 0 ? (
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-slate-400">No version experiments yet.</div>
              ) : (
                topVersions.map((version) => (
                  <div key={version.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">{version.version}</div>
                        <div className="text-sm text-slate-400">{version.runCount} runs</div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-400">{formatPercentage(version.passRate)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 text-right">
              <Link href="/agents" className="text-sm text-emerald-300 hover:text-emerald-200">
                View agent versions →
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Experiment toolkit</h2>
            <p className="mt-2 text-sm text-slate-400">Quick access to dataset creation, run comparison, and trace review.</p>
            <div className="mt-6 space-y-3">
              <Link href="/evaluations/datasets" className="block rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 hover:border-emerald-500">
                Create or update dataset
              </Link>
              <Link href="/evaluations/compare" className="block rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 hover:border-emerald-500">
                Compare two runs
              </Link>
              <Link href="/traces" className="block rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 hover:border-emerald-500">
                Review trace explorer
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Recent experiments</h2>
                  <p className="mt-2 text-sm text-slate-400">A/B experiment runs and comparison results.</p>
                </div>
                <Link href="/experiments/new" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
                  New experiment
                </Link>
              </div>

              <div className="mt-6 overflow-hidden rounded-3xl border border-slate-700 bg-slate-950">
                <div className="grid grid-cols-5 gap-4 border-b border-slate-700 bg-slate-950 px-6 py-4 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <div className="col-span-2">Experiment</div>
                  <div>Dataset</div>
                  <div>Versions</div>
                  <div>Status</div>
                </div>
                <div className="divide-y divide-slate-700">
                  {experimentsList.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">No experiments found yet. Create one to get started.</div>
                  ) : (
                    experimentsList.map((exp) => (
                      <Link
                        key={exp.id}
                        href={`/experiments/${exp.id}`}
                        className="grid grid-cols-5 gap-4 px-6 py-5 transition hover:bg-slate-900 sm:px-8"
                      >
                        <div className="col-span-2 space-y-1">
                          <div className="font-semibold text-white">{exp.name}</div>
                          <div className="text-sm text-slate-400">{new Date(exp.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-sm text-slate-300">{datasets.find((d) => d.id === exp.dataset_id)?.name ?? exp.dataset_id.slice(0, 8)}</div>
                        <div className="text-sm text-slate-300">A vs B</div>
                        <div className="text-sm capitalize">
                          <span className={exp.status === 'completed' ? 'text-emerald-200' : exp.status === 'running' ? 'text-blue-200' : exp.status === 'failed' ? 'text-red-200' : 'text-yellow-200'}>
                            {exp.status}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <ExperimentHistory experiments={experimentsList} />
            </div>
          </div>

          <div>
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Experiment analytics</h2>
                  <p className="mt-2 text-sm text-slate-400">Track version-level performance and evolving pass rates over time.</p>
                </div>
                <div className="text-sm text-slate-400">Powered by evaluation run and trace metrics.</div>
              </div>
              <div className="mt-6">
                <EvaluationAnalytics runs={runs} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
