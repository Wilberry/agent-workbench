import EvaluationStatusBadge from './EvaluationStatusBadge';

export default function EvaluationRunSummaryCard({
  title,
  subtitle,
  metricLabel,
  metricValue,
  status,
  details
}: {
  title: string;
  subtitle?: string;
  metricLabel: string;
  metricValue: string | number;
  status?: string;
  details?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm shadow-slate-950/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-slate-500">{title}</div>
          {subtitle ? <div className="mt-2 text-lg font-semibold text-slate-100">{subtitle}</div> : null}
        </div>
        {status ? <EvaluationStatusBadge status={status} /> : null}
      </div>
      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold text-white">{metricValue}</div>
          <div className="text-sm text-slate-400">{metricLabel}</div>
        </div>
        {details ? <div className="text-right text-sm text-slate-500">{details}</div> : null}
      </div>
    </div>
  );
}
