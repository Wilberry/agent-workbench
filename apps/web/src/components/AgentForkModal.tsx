'use client';

import { useState } from 'react';

export default function AgentForkModal({ onClose }: { onClose: () => void }) {
  const [workflow, setWorkflow] = useState('Planner, Executor, Reviewer');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-950 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Fork Marketplace Agent</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            Close
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">Workflow roles</label>
          <input
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            value={workflow}
            onChange={(event) => setWorkflow(event.target.value)}
          />
          <button className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black">Fork Agent</button>
        </div>
      </div>
    </div>
  );
}
