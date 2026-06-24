'use client';

import Link from 'next/link';

type InstalledAgent = {
  id: string;
  org_id: string;
  source_version_id: string;
  installed_agent_id: string;
  created_at: string;
  agents?: {
    id: string;
    name: string;
    description: string | null;
    organization_id: string | null;
  };
  agent_versions?: {
    id: string;
    version: string;
    system_prompt: string;
    model: string;
  };
};

type Props = {
  items: InstalledAgent[];
  orgId: string;
};

export default function InstalledAgentsList({ items, orgId }: Props) {
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
          No installed agents yet. Browse the marketplace to install or fork agents.
        </div>
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={`/agents/${item.installed_agent_id}`}
            className="block rounded-3xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-500 hover:bg-slate-800"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{item.agents?.name}</h3>
                <p className="text-sm text-slate-400">{item.agents?.description ?? 'No description provided.'}</p>
                <p className="mt-2 text-xs text-slate-500">From version {item.agent_versions?.version} • Model: {item.agent_versions?.model}</p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">
                  Installed
                </span>
                <span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
