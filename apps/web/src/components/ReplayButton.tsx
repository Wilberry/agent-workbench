'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentRun, AgentVersion } from '@agent-workbench/sdk';

interface ReplayButtonProps {
  run: AgentRun;
  versions?: AgentVersion[];
  onReplaySuccess?: (replayRunId: string) => void;
}

export default function ReplayButton({ run, versions, onReplaySuccess }: ReplayButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVersionSelect, setShowVersionSelect] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    (run.agent_version_id as string | null) ?? null
  );
  const router = useRouter();

  const handleReplay = async () => {
    if (!run.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalRunId: run.id,
          versionId: selectedVersionId,
          reason: 'Manual replay from UI'
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { replayRunId } = await response.json();
      onReplaySuccess?.(replayRunId);
      setShowVersionSelect(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showVersionSelect && versions && versions.length > 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <label className="mb-3 block text-sm font-semibold text-slate-200">Select version to replay with:</label>
          <select
            value={selectedVersionId ?? ''}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            className="mb-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          >
            <option value="">Latest version</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version} (v{v.version_number}) - {new Date(v.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleReplay}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isLoading ? 'Creating replay...' : 'Replay with selected version'}
            </button>
            <button
              onClick={() => setShowVersionSelect(false)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowVersionSelect(true)}
          disabled={isLoading}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {isLoading ? 'Creating replay...' : 'Replay with different version'}
        </button>
      )}
    </div>
  );
}
