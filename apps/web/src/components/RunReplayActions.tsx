'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RunReplayActions({ runId, latestVersionId }: { runId: string; latestVersionId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const doReplay = async (versionId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalRunId: runId, versionId, reason: 'Quick replay from run detail' })
      });
      if (!res.ok) throw new Error(await res.text());
      const { replayRunId } = await res.json();
      router.push(`/runs/${replayRunId}`);
    } catch (err) {
      setError((err as Error).message || 'Replay failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => doReplay(undefined)}
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Creating replay...' : 'Replay Run'}
        </button>

        <button
          onClick={() => doReplay(latestVersionId ?? null)}
          disabled={loading || !latestVersionId}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-50"
        >
          {loading ? 'Creating replay...' : 'Replay Against Latest Version'}
        </button>
      </div>
    </div>
  );
}
