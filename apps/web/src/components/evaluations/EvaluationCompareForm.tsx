'use client';

import { useMemo, useState } from 'react';
import EvaluationComparisonCard, { EvaluationComparisonSummary } from './EvaluationComparisonCard';

export default function EvaluationCompareForm({
  runSummaries
}: {
  runSummaries: (EvaluationComparisonSummary & { id: string })[];
}) {
  const [baselineId, setBaselineId] = useState<string>('');
  const [candidateId, setCandidateId] = useState<string>('');

  const baseline = useMemo(
    () => runSummaries.find((run) => run.id === baselineId) ?? null,
    [baselineId, runSummaries]
  );
  const candidate = useMemo(
    () => runSummaries.find((run) => run.id === candidateId) ?? null,
    [candidateId, runSummaries]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300">
            Baseline run
            <select
              value={baselineId}
              onChange={(event) => setBaselineId(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            >
              <option value="">Select baseline</option>
              {runSummaries.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label} — {run.datasetName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            Candidate run
            <select
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            >
              <option value="">Select candidate</option>
              {runSummaries.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label} — {run.datasetName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <EvaluationComparisonCard baseline={baseline} candidate={candidate} />
    </div>
  );
}
