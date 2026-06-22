'use client';

import { useMemo, useState } from 'react';

export type EvaluationResultRow = {
  id: string;
  index: number;
  input: unknown;
  expectedOutput: unknown;
  actualOutput?: unknown;
  passed?: boolean | null;
  score?: number | null;
};

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function EvaluationResultsTable({
  rows,
  pageSize = 8
}: {
  rows: EvaluationResultRow[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  const pageRows = useMemo(
    () => rows.slice(page * pageSize, page * pageSize + pageSize),
    [page, pageSize, rows]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Examples</h2>
            <p className="text-sm text-slate-400">Review inputs, expected outputs, and actual evaluation results.</p>
          </div>
          <div className="text-sm text-slate-400">
            Showing {pageRows.length} of {rows.length} examples
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-10 text-center text-slate-400">
            No examples available.
          </div>
        ) : (
          <div className="space-y-4">
            {pageRows.map((row) => (
              <div key={row.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm text-slate-400">Example {row.index + 1}</div>
                    <div className="mt-1 text-sm text-slate-300">{row.score !== null && row.score !== undefined ? `Score ${row.score}` : 'Score unavailable'}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                      {row.passed === true ? 'Passed' : row.passed === false ? 'Failed' : 'Pending'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Input</div>
                    <pre className="whitespace-pre-wrap rounded-2xl bg-slate-900 p-3 text-sm text-slate-200">{formatValue(row.input)}</pre>
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Expected</div>
                    <pre className="whitespace-pre-wrap rounded-2xl bg-slate-900 p-3 text-sm text-slate-200">{formatValue(row.expectedOutput)}</pre>
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Actual</div>
                    <pre className="whitespace-pre-wrap rounded-2xl bg-slate-900 p-3 text-sm text-slate-200">{formatValue(row.actualOutput)}</pre>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
              <div>
                Page {page + 1} of {pageCount}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
