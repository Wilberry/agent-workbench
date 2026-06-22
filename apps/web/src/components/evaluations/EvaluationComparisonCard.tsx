export type EvaluationComparisonSummary = {
  label: string;
  datasetName: string;
  agentVersion: string;
  score: number;
  passRate: number;
  totalExamples: number;
  passedExamples: number;
  failedExamples: number;
  createdAt: string;
};

export default function EvaluationComparisonCard({
  baseline,
  candidate
}: {
  baseline: EvaluationComparisonSummary | null;
  candidate: EvaluationComparisonSummary | null;
}) {
  if (!baseline || !candidate) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
        Choose a baseline and candidate run to compare performance, pass rate, and regression counts.
      </div>
    );
  }

  const scoreDelta = candidate.score - baseline.score;
  const passRateDelta = candidate.passRate - baseline.passRate;
  const baselineFailed = baseline.failedExamples;
  const candidateFailed = candidate.failedExamples;
  const improvementCount = Math.max(0, baselineFailed - candidateFailed);
  const regressionCount = Math.max(0, candidateFailed - baselineFailed);

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm text-slate-400">Baseline run</div>
          <div className="mt-2 text-lg font-semibold text-white">{baseline.label}</div>
          <div className="text-sm text-slate-500">{baseline.datasetName}</div>
          <div className="text-sm text-slate-500">{baseline.agentVersion}</div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm text-slate-400">Candidate run</div>
          <div className="mt-2 text-lg font-semibold text-white">{candidate.label}</div>
          <div className="text-sm text-slate-500">{candidate.datasetName}</div>
          <div className="text-sm text-slate-500">{candidate.agentVersion}</div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm text-slate-400">Score delta</div>
          <div className="mt-2 text-3xl font-semibold text-white">{scoreDelta.toFixed(2)}%</div>
          <div className="text-sm text-slate-500">{scoreDelta >= 0 ? 'Improvement' : 'Regression'}</div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm text-slate-400">Pass rate delta</div>
          <div className="mt-2 text-3xl font-semibold text-white">{(passRateDelta * 100).toFixed(2)}%</div>
          <div className="text-sm text-slate-500">{passRateDelta >= 0 ? 'Higher pass rate' : 'Lower pass rate'}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm text-slate-400">Improvement count</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-200">{improvementCount}</div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm text-slate-400">Regression count</div>
          <div className="mt-2 text-3xl font-semibold text-red-200">{regressionCount}</div>
        </div>
      </div>
    </div>
  );
}
