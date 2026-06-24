'use client';

import { useMemo } from 'react';
import type { Experiment } from '@agent-workbench/sdk';

interface ExperimentHistoryProps {
  experiments: Array<Experiment & { versionA?: { version: string }; versionB?: { version: string } }>;
}

export default function ExperimentHistory({ experiments }: ExperimentHistoryProps) {
  const timelineEvents = useMemo(() => {
    return experiments
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((exp, index) => ({
        id: exp.id,
        name: exp.name,
        date: new Date(exp.created_at),
        status: exp.status,
        versions: `${exp.versionA?.version || 'v?'} vs ${exp.versionB?.version || 'v?'}`,
        isLatest: index === 0
      }));
  }, [experiments]);

  if (timelineEvents.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold mb-4">Experiment history</h3>
        <div className="text-center text-slate-400 py-8">No experiments yet. Create your first experiment to get started.</div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <h3 className="text-lg font-semibold mb-6">Experiment history</h3>

      <div className="space-y-4">
        {timelineEvents.map((event, idx) => (
          <div
            key={event.id}
            className={`flex gap-4 pb-4 ${idx < timelineEvents.length - 1 ? 'border-b border-slate-700' : ''}`}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${event.isLatest ? 'bg-emerald-400' : 'bg-slate-600'}`}></div>
              {idx < timelineEvents.length - 1 && <div className="w-0.5 h-8 bg-slate-700 mt-2"></div>}
            </div>

            {/* Event content */}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{event.name}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {event.date.toLocaleDateString()} {event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{event.versions}</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      event.status === 'completed'
                        ? 'bg-emerald-950 text-emerald-300'
                        : event.status === 'running'
                          ? 'bg-blue-950 text-blue-300'
                          : event.status === 'failed'
                            ? 'bg-red-950 text-red-300'
                            : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
