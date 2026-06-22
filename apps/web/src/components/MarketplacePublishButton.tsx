'use client';

import { useState } from 'react';

type Props = {
  orgId: string;
  itemId: string;
  initialVisibility: 'public' | 'private';
};

export default function MarketplacePublishButton({ orgId, itemId, initialVisibility }: Props) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const toggleVisibility = async () => {
    const targetVisibility = visibility === 'public' ? 'private' : 'public';
    const confirmMessage =
      visibility === 'public'
        ? 'Are you sure you want to make this listing private?'
        : 'Publish this listing to the public marketplace?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/org/${orgId}/agents/${itemId}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: targetVisibility })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to update visibility');
      }

      setVisibility(targetVisibility);
      setSuccessMessage(`Visibility updated to ${targetVisibility}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        onClick={toggleVisibility}
        disabled={isSaving}
        className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500 disabled:opacity-60"
      >
        {visibility === 'public' ? 'Make private' : 'Publish to marketplace'}
      </button>
      <div className="text-sm text-slate-400">Current visibility: {visibility}</div>
      {successMessage ? <div className="text-sm text-emerald-300">{successMessage}</div> : null}
      {error ? <div className="text-sm text-red-400">{error}</div> : null}
    </div>
  );
}
