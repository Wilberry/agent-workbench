type EvaluationStatus = 'pending' | 'running' | 'completed' | 'failed' | string;

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-900 text-yellow-100',
  running: 'bg-blue-900 text-blue-100',
  completed: 'bg-emerald-900 text-emerald-100',
  failed: 'bg-red-900 text-red-100'
};

export default function EvaluationStatusBadge({
  status,
  className = ''
}: {
  status: EvaluationStatus;
  className?: string;
}) {
  const normalized = String(status ?? 'unknown').toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        statusStyles[normalized] ?? 'bg-slate-700 text-slate-100'
      } ${className}`}
    >
      {label}
    </span>
  );
}
