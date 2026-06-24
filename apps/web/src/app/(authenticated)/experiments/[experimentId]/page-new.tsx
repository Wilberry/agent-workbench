import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import ExecuteExperimentButton from '@/components/experiments/ExecuteExperimentButton';
import MetricsComparison from '@/components/experiments/MetricsComparison';
import TraceComparisonView from '@/components/experiments/TraceComparisonView';
import { agents, evaluations, experiments } from '@agent-workbench/sdk';
import type { Experiment, EvaluationRun, EvaluationRunResult, EvaluationDatasetExample } from '@agent-workbench/sdk';

type Params = {
  params: {
    experimentId: string;
  };
};

export default async function ExperimentDetailPage({ params }: Params) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const experiment = await experiments.getExperiment(params.experimentId, supabase);

  if (!experiment) {
    return <div className="p-6 text-red-400">Experiment not found.</div>;
  }

  const [versionA, versionB, dataset] = await Promise.all([
    agents.getVersion(experiment.version_a_id, supabase),
    agents.getVersion(experiment.version_b_id, supabase),
    evaluations.getDataset(experiment.dataset_id, supabase)
  ]);

  let runA: EvaluationRun | null = null;
  let runB: EvaluationRun | null = null;
  let resultsA: EvaluationRunResult[] = [];
  let resultsB: EvaluationRunResult[] = [];
  let examplesMap: Record<string, EvaluationDatasetExample> = {};

  if (experiment.run_a_id) {
    runA = await evaluations.getEvaluationRun(experiment.run_a_id, supabase);
    resultsA = await evaluations.getEvaluationResults(experiment.run_a_id, supabase);
  }

  if (experiment.run_b_id) {
    runB = await evaluations.getEvaluationRun(experiment.run_b_id, supabase);
    resultsB = await evaluations.getEvaluationResults(experiment.run_b_id, supabase);
  }

  const allExampleIds = Array.from(new Set([...resultsA.map((r) => r.example_id), ...resultsB.map((r) => r.example_id)]));
  if (allExampleIds.length > 0) {
    const examples = await evaluations.getDatasetExamplesByIds(allExampleIds, supabase);
    examplesMap = examples.reduce<Record<string, EvaluationDatasetExample>>((acc, example) => {
      acc[example.id] = example;
      return acc;
    }, {});
  }

  const resultAMap = resultsA.reduce<Record<string, EvaluationRunResult>>((acc, result) => {
    acc[result.example_id] = result;
    return acc;
  }, {});

  const resultBMap = resultsB.reduce<Record<string, EvaluationRunResult>>((acc, result) => {
    acc[result.example_id] = result;
    return acc;
  }, {});

  let improvements = 0;
  let regressions = 0;
  let noChange = 0;
  let failuresA = 0;
  let failuresB = 0;

  for (const exampleId of allExampleIds) {
    const resultA = resultAMap[exampleId];
    const resultB = resultBMap[exampleId];

    if (!resultA || !resultB) continue;

    if (!resultA.exact_match) failuresA += 1;
    if (!resultB.exact_match) failuresB += 1;

    if (resultA.exact_match && !resultB.exact_match) {
      regressions += 1;
    } else if (!resultA.exact_match && resultB.exact_match) {
      improvements += 1;
    } else {
      noChange += 1;
    }
  }

  const passRateA = resultsA.length ? resultsA.filter((r) => r.exact_match).length / resultsA.length : 0;
  const passRateB = resultsB.length ? resultsB.filter((r) => r.exact_match).length / resultsB.length : 0;
  const passRateDelta = passRateB - passRateA;

  const detailRows = allExampleIds.map((exampleId) => {
    const example = examplesMap[exampleId];
    const resultA = resultAMap[exampleId];
    const resultB = resultBMap[exampleId];

    return {
      id: exampleId,
      input: example?.input ?? {},
      expected: example?.expected_output ?? {},
      passedA: resultA?.exact_match ?? false,
      passedB: resultB?.exact_match ?? false,
      outputA: resultA?.agent_output ?? null,
      outputB: resultB?.agent_output ?? null,
      status: resultA?.exact_match === resultB?.exact_match ? 'no-change' : resultA?.exact_match ? 'regression' : 'improvement'
    };
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Experiment details</h1>
            <p className="mt-2 text-slate-400">Compare agent versions across evaluation datasets.</p>
          </div>
          <Link
            href="/experiments"
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
          >
            Back to experiments
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="space-y-6">
            <div>
              <div className="text-sm text-slate-400">Experiment name</div>
              <div className="mt-2 text-2xl font-semibold text-white">{experiment.name}</div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Dataset</div>
                <div className="mt-2 text-lg font-semibold text-white">{dataset?.name ?? 'Unknown'}</div>
              </div>
              <div className="rounded-3xl bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Status</div>
                <div className="mt-2 text-lg font-semibold text-white capitalize">{experiment.status}</div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Version A</div>
                <div className="mt-2 text-lg font-semibold text-white">{versionA?.version ?? 'Unknown'}</div>
                {runA && (
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="text-slate-500">Run: {runA.id.slice(0, 8)}</div>
                    <div className="text-slate-500">Pass rate: {((resultsA.filter((r) => r.exact_match).length / resultsA.length) * 100).toFixed(1)}%</div>
                  </div>
                )}
              </div>
              <div className="rounded-3xl bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Version B</div>
                <div className="mt-2 text-lg font-semibold text-white">{versionB?.version ?? 'Unknown'}</div>
                {runB && (
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="text-slate-500">Run: {runB.id.slice(0, 8)}</div>
                    <div className="text-slate-500">Pass rate: {((resultsB.filter((r) => r.exact_match).length / resultsB.length) * 100).toFixed(1)}%</div>
                  </div>
                )}
              </div>
            </div>

            {!runA && !runB && (
              <div className="rounded-3xl bg-emerald-950/20 border border-emerald-700 p-4">
                <ExecuteExperimentButton experimentId={params.experimentId} />
              </div>
            )}

            <div className="text-xs text-slate-500">Created {new Date(experiment.created_at).toLocaleString()}</div>
          </div>
        </div>

        {runA && runB ? (
          <>
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold mb-6">Comparison results</h2>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">Pass rate delta</div>
                  <div className={`mt-2 text-3xl font-semibold ${passRateDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(passRateDelta * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">Improvements</div>
                  <div className="mt-2 text-3xl font-semibold text-emerald-200">{improvements}</div>
                </div>
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">Regressions</div>
                  <div className="mt-2 text-3xl font-semibold text-red-200">{regressions}</div>
                </div>
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">No change</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-400">{noChange}</div>
                </div>
              </div>
            </div>

            <MetricsComparison
              runA={runA}
              runB={runB}
              passRateA={passRateA}
              passRateB={passRateB}
              failuresA={failuresA}
              failuresB={failuresB}
            />

            <TraceComparisonView resultsA={resultsA} resultsB={resultsB} />

            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold mb-6">Detailed comparison</h2>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-3 text-left text-slate-400 font-semibold">Result</th>
                      <th className="px-4 py-3 text-left text-slate-400 font-semibold">Version A</th>
                      <th className="px-4 py-3 text-left text-slate-400 font-semibold">Version B</th>
                      <th className="px-4 py-3 text-left text-slate-400 font-semibold">Input</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((row, idx) => (
                      <tr key={row.id} className="border-b border-slate-700 hover:bg-slate-950/50">
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                              row.status === 'improvement'
                                ? 'bg-emerald-950 text-emerald-200'
                                : row.status === 'regression'
                                  ? 'bg-red-950 text-red-200'
                                  : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {row.status === 'improvement' ? 'Improvement' : row.status === 'regression' ? 'Regression' : 'No change'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={row.passedA ? 'text-emerald-200' : 'text-red-200'}>{row.passedA ? 'Pass' : 'Fail'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={row.passedB ? 'text-emerald-200' : 'text-red-200'}>{row.passedB ? 'Pass' : 'Fail'}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {typeof row.input === 'object' ? JSON.stringify(row.input).slice(0, 50) + '...' : String(row.input).slice(0, 50) + '...'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
            This experiment has not been executed yet. Start the experiment to generate comparison results.
          </div>
        )}
      </div>
    </main>
  );
}
