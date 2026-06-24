import Link from 'next/link';
import type { Database } from '@/types/database';
import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationCompareForm from '@/components/evaluations/EvaluationCompareForm';
import { evaluations, agents } from '@agent-workbench/sdk';
import type { EvaluationRun } from '@agent-workbench/sdk';

export default async function EvaluationComparePage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const runs = await evaluations.listEvaluationRuns(undefined, supabase);
  const [datasets, versions, results] = await Promise.all([
    evaluations.listDatasets(undefined, undefined, supabase),
    agents.listAllVersions(supabase),
    runs.length > 0 ? evaluations.listEvaluationResults({ runIds: runs.map((run) => run.id) }, supabase) : []
  ]);


  const datasetMap = datasets.reduce<Record<string, string>>((acc, dataset) => {
    acc[dataset.id] = dataset.name;
    return acc;
  }, {});
  const versionMap = versions.reduce<Record<string, string>>((acc, version) => {
    acc[version.id] = version.version;
    return acc;
  }, {});

  const runSummaries = runs.map((run) => {
    const runResults = results.filter((result) => result.evaluation_run_id === run.id);
    const totalExamples = runResults.length;
    const passedExamples = runResults.filter((result) => result.exact_match).length;
    const passRate = totalExamples ? passedExamples / totalExamples : 0;
    return {
      id: run.id,
      label: `Run ${run.id.slice(0, 8)}`,
      datasetName: datasetMap[run.dataset_id] ?? run.dataset_id.slice(0, 8),
      agentVersion: versionMap[run.agent_version_id] ?? run.agent_version_id.slice(0, 8),
      score: passRate * 100,
      passRate,
      totalExamples,
      passedExamples,
      failedExamples: totalExamples - passedExamples,
      createdAt: run.created_at
    };
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Compare evaluation runs</h1>
            <p className="mt-2 text-slate-400">Select two runs to compare success rate, score delta, and regressions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={{ pathname: '/evaluations/runs' }}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Back to runs
            </Link>
            <Link
              href={{ pathname: '/evaluations' }}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <EvaluationCompareForm runSummaries={runSummaries} />
      </div>
    </main>
  );
}
