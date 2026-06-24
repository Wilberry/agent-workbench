import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationStatusBadge from '@/components/evaluations/EvaluationStatusBadge';
import EvaluationResultsTable from '@/components/evaluations/EvaluationResultsTable';
import { evaluations, agents } from '@agent-workbench/sdk';
import type { EvaluationRun, EvaluationRunResult, EvaluationDatasetExample } from '@agent-workbench/sdk';

type Params = {
  params: {
    runId: string;
  };
};

export default async function EvaluationRunDetailPage({ params }: Params) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const run = await evaluations.getEvaluationRun(params.runId, supabase);
  if (!run) {
    return <div className="p-6 text-red-400">Evaluation run not found.</div>;
  }

  const [dataset, version, results] = await Promise.all([
    evaluations.getDataset(run.dataset_id, supabase),
    agents.getVersion(run.agent_version_id, supabase),
    evaluations.getEvaluationResults(run.id, supabase)
  ]);

  const datasetName = dataset?.name ?? 'Unknown dataset';
  const versionLabel = version?.version ?? 'Unknown version';
  const resultRows = results as EvaluationRunResult[];
  const exampleIds = resultRows.map((result) => result.example_id);
  const examples = exampleIds.length > 0 ? await evaluations.getDatasetExamplesByIds(exampleIds, supabase) : [];

  const exampleMap = examples.reduce<Record<string, EvaluationDatasetExample>>((acc, example) => {
    acc[example.id] = example;
    return acc;
  }, {});

  const rows = resultRows.map((result, index) => {
    const example = exampleMap[result.example_id];
    return {
      id: result.id,
      index,
      input: example?.input ?? {},
      expectedOutput: example?.expected_output ?? {},
      actualOutput: result.agent_output,
      passed: result.exact_match,
      score: typeof result.details?.score === 'number' ? result.details.score : null
    };
  });

  const passedExamples = resultRows.filter((result) => result.exact_match).length;
  const totalExamples = resultRows.length;
  const passRate = totalExamples ? passedExamples / totalExamples : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Evaluation run details</h1>
            <p className="mt-2 text-slate-400">Review exact match results and run metadata.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={{ pathname: '/evaluations/runs' }}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Back to runs
            </Link>
            <Link
              href={{ pathname: '/evaluations/compare' }}
              className="rounded-2xl border border-slate-700 bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
            >
              Compare runs
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm text-slate-400">Run ID</div>
              <div className="mt-2 text-lg font-semibold text-white">{run.id}</div>
            </div>
            <EvaluationStatusBadge status={run.status} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Dataset</div>
              <div className="mt-2 text-xl font-semibold text-white">{datasetName}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Agent version</div>
              <div className="mt-2 text-xl font-semibold text-white">{versionLabel}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Created</div>
              <div className="mt-2 text-xl font-semibold text-white">{new Date(run.created_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Total examples</div>
              <div className="mt-2 text-3xl font-semibold text-white">{totalExamples}</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Pass rate</div>
              <div className="mt-2 text-3xl font-semibold text-white">{(passRate * 100).toFixed(1)}%</div>
            </div>
            <div className="rounded-3xl bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Passed</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-200">{passedExamples}</div>
            </div>
          </div>
        </div>

        <EvaluationResultsTable rows={rows} />
      </div>
    </main>
  );
}
