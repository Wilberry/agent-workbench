'use client';

import { useState, useMemo } from 'react';
import type { AgentVersion } from '@agent-workbench/sdk';

interface AgentVersionComparisonProps {
  versions: AgentVersion[];
  agentId: string;
}

type VersionField = 'model' | 'system_prompt' | 'tools' | 'workflow' | 'metadata';

interface DiffField {
  field: VersionField;
  changed: boolean;
  v1: any;
  v2: any;
}

export default function AgentVersionComparison({ versions, agentId }: AgentVersionComparisonProps) {
  const [v1Id, setV1Id] = useState<string | null>(versions[0]?.id ?? null);
  const [v2Id, setV2Id] = useState<string | null>(versions[1]?.id ?? null);

  const v1 = useMemo(() => versions.find((v) => v.id === v1Id), [versions, v1Id]);
  const v2 = useMemo(() => versions.find((v) => v.id === v2Id), [versions, v2Id]);

  const diffs = useMemo(() => {
    if (!v1 || !v2) return [];

    const fields: DiffField[] = [
      {
        field: 'model',
        changed: v1.model !== v2.model,
        v1: v1.model,
        v2: v2.model
      },
      {
        field: 'system_prompt',
        changed: v1.system_prompt !== v2.system_prompt,
        v1: v1.system_prompt,
        v2: v2.system_prompt
      },
      {
        field: 'tools',
        changed: JSON.stringify(v1.tools) !== JSON.stringify(v2.tools),
        v1: v1.tools || [],
        v2: v2.tools || []
      },
      {
        field: 'workflow',
        changed: JSON.stringify(v1.workflow) !== JSON.stringify(v2.workflow),
        v1: v1.workflow || [],
        v2: v2.workflow || []
      },
      {
        field: 'metadata',
        changed: JSON.stringify(v1.metadata) !== JSON.stringify(v2.metadata),
        v1: v1.metadata || {},
        v2: v2.metadata || {}
      }
    ];

    return fields;
  }, [v1, v2]);

  const changedCount = diffs.filter((d) => d.changed).length;

  if (versions.length < 2) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
        You need at least 2 versions to compare.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Version selector */}
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">Version Comparison</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Compare from</label>
            <select
              value={v1Id ?? ''}
              onChange={(e) => setV1Id(e.target.value || null)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version} (v{v.version_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Compare to</label>
            <select
              value={v2Id ?? ''}
              onChange={(e) => setV2Id(e.target.value || null)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version} (v{v.version_number})
                </option>
              ))}
            </select>
          </div>
        </div>

        {v1 && v2 && (
          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3">
            <div className="text-sm text-slate-400">
              {changedCount === 0 ? (
                <span className="text-emerald-400">✓ No differences</span>
              ) : (
                <span className="text-yellow-400">{changedCount} field(s) changed</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Comparison details */}
      {v1 && v2 && (
        <div className="space-y-4">
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className={`rounded-3xl border p-6 ${
                diff.changed
                  ? 'border-yellow-700 bg-yellow-950/30'
                  : 'border-slate-700 bg-slate-900'
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-100 capitalize">
                  {diff.field.replace(/_/g, ' ')}
                </h4>
                {diff.changed && <span className="text-xs text-yellow-300">Modified</span>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs text-slate-400">From: {v1.version}</div>
                  <div className="rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
                    {diff.field === 'system_prompt' ? (
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                        {String(diff.v1).substring(0, 500)}
                        {String(diff.v1).length > 500 ? '...' : ''}
                      </pre>
                    ) : Array.isArray(diff.v1) ? (
                      <div className="space-y-1">
                        {diff.v1.length === 0 ? (
                          <span className="text-slate-500">Empty</span>
                        ) : (
                          diff.v1.map((item: any, idx: number) => (
                            <div key={idx} className="text-xs">
                              {typeof item === 'string' ? item : JSON.stringify(item)}
                            </div>
                          ))
                        )}
                      </div>
                    ) : typeof diff.v1 === 'object' ? (
                      <pre className="max-h-40 overflow-auto text-xs">
                        {JSON.stringify(diff.v1, null, 2)}
                      </pre>
                    ) : (
                      <span>{String(diff.v1)}</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-slate-400">To: {v2.version}</div>
                  <div className="rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
                    {diff.field === 'system_prompt' ? (
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                        {String(diff.v2).substring(0, 500)}
                        {String(diff.v2).length > 500 ? '...' : ''}
                      </pre>
                    ) : Array.isArray(diff.v2) ? (
                      <div className="space-y-1">
                        {diff.v2.length === 0 ? (
                          <span className="text-slate-500">Empty</span>
                        ) : (
                          diff.v2.map((item: any, idx: number) => (
                            <div key={idx} className="text-xs">
                              {typeof item === 'string' ? item : JSON.stringify(item)}
                            </div>
                          ))
                        )}
                      </div>
                    ) : typeof diff.v2 === 'object' ? (
                      <pre className="max-h-40 overflow-auto text-xs">
                        {JSON.stringify(diff.v2, null, 2)}
                      </pre>
                    ) : (
                      <span>{String(diff.v2)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
