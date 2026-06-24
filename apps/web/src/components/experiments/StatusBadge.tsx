'use client';

interface StatusBadgeProps {
  status: 'draft' | 'running' | 'completed' | 'failed' | 'pending';
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const baseClasses = 'inline-block px-2 py-1 rounded text-xs font-semibold';
  const sizeClasses = size === 'sm' ? 'px-1.5 text-xs' : 'px-2 py-1';

  const statusClasses = {
    completed: 'bg-emerald-950 text-emerald-300',
    running: 'bg-blue-950 text-blue-300',
    failed: 'bg-red-950 text-red-300',
    draft: 'bg-slate-800 text-slate-300',
    pending: 'bg-yellow-950 text-yellow-300'
  };

  return (
    <span className={`${baseClasses} ${sizeClasses} ${statusClasses[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
