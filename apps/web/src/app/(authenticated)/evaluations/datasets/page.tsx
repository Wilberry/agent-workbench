import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import EvaluationDatasetTable from '@/components/evaluations/EvaluationDatasetTable';
import type { EvaluationDataset } from '@agent-workbench/sdk';

export default async function EvaluationsDatasetsPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const datasetsRes = await supabase
    .from('evaluation_datasets')
    .select('*')
    .order('created_at', { ascending: false });
  const examplesRes = await supabase.from('evaluation_dataset_examples').select('dataset_id');

  const datasets = (datasetsRes.data ?? []) as EvaluationDataset[];
  const exampleRows = examplesRes.data ?? [];

  const exampleCounts = exampleRows.reduce<Record<string, number>>((acc, example) => {
    if (!example?.dataset_id) return acc;
    acc[example.dataset_id] = (acc[example.dataset_id] ?? 0) + 1;
    return acc;
  }, {});

  const datasetsWithCount = datasets.map((dataset) => ({
    ...dataset,
    exampleCount: exampleCounts[dataset.id] ?? 0
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Evaluation datasets</h1>
            <p className="mt-2 text-slate-400">Create and manage your dataset benchmarks for evaluation.</p>
          </div>
          <Link
            href={{ pathname: '/evaluations' }}
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
          >
            Back to dashboard
          </Link>
        </div>

        <EvaluationDatasetTable datasets={datasetsWithCount} />
      </div>
    </main>
  );
}
