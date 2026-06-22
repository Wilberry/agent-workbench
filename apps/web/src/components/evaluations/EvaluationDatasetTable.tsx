'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { EvaluationDataset } from '@agent-workbench/sdk';
import EvaluationStatusBadge from './EvaluationStatusBadge';

type DatasetWithCount = EvaluationDataset & {
  exampleCount: number;
};

export default function EvaluationDatasetTable({
  datasets
}: {
  datasets: DatasetWithCount[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const filteredDatasets = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return datasets;
    return datasets.filter((dataset) => {
      return (
        dataset.name.toLowerCase().includes(normalized) ||
        dataset.description?.toLowerCase().includes(normalized) ||
        dataset.tags.some((tag) => tag.toLowerCase().includes(normalized))
      );
    });
  }, [datasets, search]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);

    try {
      const response = await fetch('/api/evaluations/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        })
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to create dataset');
      }

      setName('');
      setDescription('');
      setTags('');
      setShowForm(false);
      router.refresh();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Datasets</h2>
          <p className="mt-2 text-sm text-slate-400">Manage evaluation datasets, tags, and example counts.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search datasets"
            className="w-full min-w-0 rounded-3xl border border-slate-700 bg-slate-950 px-4 py-2 text-white outline-none focus:border-emerald-500 sm:w-64"
          />
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="rounded-3xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            {showForm ? 'Cancel' : 'Create dataset'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              Name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-white outline-none focus:border-emerald-500"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              Tags
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="comma separated"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-white outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            />
          </label>
          {errorMessage ? <div className="mt-3 text-sm text-red-400">{errorMessage}</div> : null}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-3xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {isSaving ? 'Creating...' : 'Create dataset'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900">
        <div className="grid grid-cols-6 gap-4 border-b border-slate-700 bg-slate-950 px-6 py-4 text-xs uppercase tracking-[0.2em] text-slate-500">
          <div className="col-span-2">Dataset</div>
          <div>Examples</div>
          <div>Tags</div>
          <div>Created</div>
          <div className="text-right">Action</div>
        </div>
        <div className="divide-y divide-slate-700">
          {filteredDatasets.length === 0 ? (
            <div className="p-6 text-center text-slate-400">No datasets match that filter.</div>
          ) : (
            filteredDatasets.map((dataset) => (
              <div key={dataset.id} className="grid grid-cols-6 gap-4 px-6 py-5 hover:bg-slate-950/60 sm:px-8">
                <div className="col-span-2 space-y-1">
                  <div className="text-sm font-semibold text-white">{dataset.name}</div>
                  <div className="text-sm text-slate-400 truncate">{dataset.description ?? 'No description'}</div>
                </div>
                <div className="text-sm text-slate-300">{dataset.exampleCount} examples</div>
                <div className="flex flex-wrap gap-2">
                  {dataset.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-slate-400">{new Date(dataset.created_at).toLocaleDateString()}</div>
                <div className="flex items-center justify-end">
                  <Link
                    href={{ pathname: '/evaluations/datasets/[datasetId]', query: { datasetId: dataset.id } }}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
