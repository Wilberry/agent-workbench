'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AgentVersion } from '@agent-workbench/sdk';

interface AgentVersionHistoryProps {
  agentId: string;
  versions: AgentVersion[];
  currentVersion?: AgentVersion | null;
}

export default function AgentVersionHistory({
  agentId,
  versions,
  currentVersion
}: AgentVersionHistoryProps) {
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  if (versions.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
        No versions yet. Create a version from the agent editor.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {versions.map((version) => {
        const isExpanded = expandedVersionId === version.id;
        const isCurrent = currentVersion?.id === version.id;

        return (
          <div
            key={version.id}
            className="rounded-2xl border border-slate-700 bg-slate-900 p-4 transition hover:border-slate-600"
          >
            <button
              onClick={() => setExpandedVersionId(isExpanded ? null : version.id)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100">{version.version}</span>
                    <span className="text-xs text-slate-500">v{version.version_number}</span>
                    {isCurrent && (
                      <span className="inline-block rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-200">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{version.description || 'No description'}</div>
                  <div className="mt-1 flex gap-4 text-xs text-slate-500">
                    <span>Created: {new Date(version.created_at).toLocaleString()}</span>
                    {version.created_by && (
                      <span>By: {version.created_by.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
                <svg
                  className={`h-5 w-5 text-slate-400 transition ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-300">Model</div>
                  <div className="text-sm text-slate-400">{version.model}</div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-300">Workflow</div>
                  <div className="text-sm text-slate-400">
                    {version.workflow && version.workflow.length > 0
                      ? version.workflow.join(' → ')
                      : 'Default workflow'}
                  </div>
                </div>

                {version.tools && version.tools.length > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-300">Tools</div>
                    <div className="flex flex-wrap gap-2">
                      {version.tools.map((tool: any, idx: number) => (
                        <span
                          key={idx}
                          className="inline-block rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
                        >
                          {typeof tool === 'string' ? tool : tool.name || 'Tool'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-300">System Prompt</div>
                  <pre className="max-h-32 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-300">
                    {version.system_prompt.substring(0, 300)}
                    {version.system_prompt.length > 300 ? '...' : ''}
                  </pre>
                </div>

                <div className="flex gap-2 pt-2">
                  <Link
                    href={`/agents/${agentId}?versionId=${version.id}`}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500"
                  >
                    View Version
                  </Link>
                  {!isCurrent && (
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Restore as Current
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
