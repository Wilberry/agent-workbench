'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExecuteExperimentButton({ experimentId }: { experimentId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleExecute = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/experiments/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentId })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to execute experiment');
      }

      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleExecute}
        disabled={isLoading}
        className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Running experiment...' : 'Execute experiment'}
      </button>
      {error && <div className="rounded-2xl border border-red-500 bg-red-950/20 p-3 text-sm text-red-300">{error}</div>}
    </div>
  );
}
