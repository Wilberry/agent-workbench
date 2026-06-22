import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationResultsTable from '@/components/evaluations/EvaluationResultsTable';
import type { EvaluationDataset, EvaluationDatasetExample, EvaluationRun } from '@agent-workbench/sdk';

type Params = {
  params: {
    datasetId: string;
  };
};

export default async function EvaluationDatasetDetailPage({ params }: Params) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const [datasetRes, examplesRes, runsRes] = await Promise.all([
    supabase.from('evaluation_datasets').select('*').eq('id', params.datasetId).single(),
    supabase
      .from('evaluation_dataset_examples')
      .select('*')
      .eq('dataset_id', params.datasetId)
      .order('example_index', { ascending: true }),
    supabase.from('evaluation_runs').select('*').eq('dataset_id', params.datasetId)
  ]);

  if (datasetRes.error || !datasetRes.data) {
    return <div className="p-6 text-red-400">Dataset not found.</div>;
  }

  const dataset = datasetRes.data as EvaluationDataset;
  const examples = (examplesRes.data ?? []) as EvaluationDatasetExample[];
  const runs = (runsRes.data ?? []) as EvaluationRun[];

  const completedRuns = runs.filter((run) => run.status === 'completed');
  const averageScore = completedRuns.length
    ? completedRuns.reduce((sum, run) => sum + Number(run.summary?.exact_match_rate ?? 0), 0) / completedRuns.length
    : 0;
  const totalRuns = runs.length;
  const passRate = completedRuns.length ? averageScore : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{dataset.name}</h1>
            <p className="mt-2 text-slate-400">{dataset.description ?? 'No description available.'}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={{ pathname: '/evaluations/datasets' }}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Back to datasets
            </Link>
            <Link
              href={{ pathname: '/evaluations' }}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="text-sm text-slate-400">Examples</div>
            <div className="mt-3 text-3xl font-semibold text-white">{examples.length}</div>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="text-sm text-slate-400">Runs</div>
            <div className="mt-3 text-3xl font-semibold text-white">{totalRuns}</div>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="text-sm text-slate-400">Avg exact match</div>
            <div className="mt-3 text-3xl font-semibold text-white">{(passRate * 100).toFixed(1)}%</div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Dataset metadata</h2>
              <p className="text-sm text-slate-400">Core dataset information and tags.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-slate-400">Dataset ID</div>
              <div className="mt-2 text-sm text-slate-200 break-all">{dataset.id}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Created</div>
              <div className="mt-2 text-sm text-slate-200">{new Date(dataset.created_at).toLocaleString()}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-sm text-slate-400">Tags</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {dataset.tags.length === 0 ? (
                  <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-400">No tags</span>
                ) : (
                  dataset.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200">
                      {tag}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <EvaluationResultsTable
          rows={examples.map((example, index) => ({
            id: example.id,
            index: example.example_index,
            input: example.input,
            expectedOutput: example.expected_output,
            actualOutput: undefined,
            passed: null,
            score: null
          }))}
        />
      </div>
    </main>
  );
}
