import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agents, evaluations, experiments } from '@agent-workbench/sdk';
import type { Database } from '@/types/database';

async function createExperiment(formData: FormData) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const name = formData.get('name')?.toString().trim() ?? '';
  const agentId = formData.get('agentId')?.toString().trim() ?? '';
  const versionAId = formData.get('versionAId')?.toString().trim() ?? '';
  const versionBId = formData.get('versionBId')?.toString().trim() ?? '';
  const datasetId = formData.get('datasetId')?.toString().trim() ?? '';

  if (!name || !agentId || !versionAId || !versionBId || !datasetId) {
    throw new Error('All fields are required');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const experiment = await experiments.createExperiment(
    user.id,
    {
      name,
      agentId,
      versionAId,
      versionBId,
      datasetId,
      organizationId: null
    },
    supabase
  );

  redirect(`/experiments/${experiment.id}`);
}

export default async function NewExperimentPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const [agentRecords, versionRecords, datasetRecords] = await Promise.all([
    agents.listAll(supabase),
    agents.listAllVersions(supabase),
    evaluations.listDatasets(undefined, undefined, supabase)
  ]);

  const agentOptions = agentRecords as Array<{ id: string; name: string }>;
  const versions = versionRecords as Array<{ id: string; version: string; agent_id: string }>;
  const datasets = datasetRecords as Array<{ id: string; name: string }>;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Create experiment</h1>
              <p className="mt-2 text-slate-400">Set up a new A/B experiment to compare two agent versions.</p>
            </div>
            <Link href="/experiments" className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
              Back to experiments
            </Link>
          </div>
        </div>

        <form action={createExperiment} className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-200">Experiment name</label>
            <input
              name="name"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="e.g., GPT-4 vs Claude 3 on customer support"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Agent</label>
            <select
              name="agentId"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            >
              <option value="">Select an agent</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-200">Version A (baseline)</label>
              <select
                name="versionAId"
                required
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              >
                <option value="">Select version A</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.version}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200">Version B (candidate)</label>
              <select
                name="versionBId"
                required
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              >
                <option value="">Select version B</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.version}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Evaluation dataset</label>
            <select
              name="datasetId"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            >
              <option value="">Select a dataset</option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Create experiment
          </button>
        </form>
      </div>
    </main>
  );
}
