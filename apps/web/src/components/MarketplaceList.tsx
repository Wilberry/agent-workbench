'use client';

import Link from 'next/link';
import { useState } from 'react';

type MarketplaceItem = {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  versionId?: string;
};

type Props = {
  items: MarketplaceItem[];
  orgId?: string;
};

export default function MarketplaceList({ items, orgId }: Props) {
  const [isInstalling, setIsInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async (e: React.MouseEvent, versionId: string) => {
    e.preventDefault();
    if (!orgId) return;

    const agentName = prompt('Enter a name for the installed agent:');
    if (!agentName) return;

    setIsInstalling(versionId);
    setError(null);

    try {
      const response = await fetch(`/api/org/${orgId}/marketplace/${versionId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to install agent');
      }

      // Redirect to the newly created agent
      const data = await response.json();
      window.location.href = `/agents/${data.agent.id}`;
    } catch (err) {
      setError((err as Error).message);
      setIsInstalling(null);
    }
  };

  const handleFork = async (e: React.MouseEvent, versionId: string) => {
    e.preventDefault();
    if (!orgId) return;

    const agentName = prompt('Enter a name for the forked agent:');
    if (!agentName) return;

    setIsInstalling(versionId);
    setError(null);

    try {
      const response = await fetch(`/api/org/${orgId}/marketplace/${versionId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to fork agent');
      }

      // Redirect to the newly forked agent
      const data = await response.json();
      window.location.href = `/agents/${data.agent.id}`;
    } catch (err) {
      setError((err as Error).message);
      setIsInstalling(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-3xl border border-rose-500 bg-rose-950/20 p-4 text-rose-300">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
          No marketplace agents found.
        </div>
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={`/marketplace/${item.versionId || item.id}`}
            className="block rounded-3xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-500 hover:bg-slate-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{item.description ?? 'No description provided.'}</p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-widest text-slate-300">
                  {item.visibility}
                </span>
                {orgId && (
                  <div className="flex flex-col gap-2 items-end">
                    <button
                      onClick={(e) => handleInstall(e, item.versionId || item.id)}
                      disabled={isInstalling === (item.versionId || item.id)}
                      className="rounded-2xl bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 transition"
                    >
                      {isInstalling === (item.versionId || item.id) ? 'Installing...' : 'Install'}
                    </button>
                    <button
                      onClick={(e) => handleFork(e, item.versionId || item.id)}
                      disabled={isInstalling === (item.versionId || item.id)}
                      className="rounded-2xl border border-slate-600 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-60 transition"
                    >
                      {isInstalling === (item.versionId || item.id) ? 'Forking...' : 'Fork'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
