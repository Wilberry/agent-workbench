import Link from 'next/link';
import { marketplace } from '@agent-workbench/sdk';

export default async function MarketplacePage() {
  const list = await marketplace.listPublicAgentVersions(50);

  return (
    <main className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Agent Marketplace</h1>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4">
          {list.map((ver: any) => (
            <Link
              key={ver.id}
              href={`/marketplace/${ver.id}`}
              className="block rounded border border-slate-700 bg-slate-900 p-4 hover:border-emerald-500"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{ver.agents?.name || 'Unnamed agent'}</div>
                  <div className="text-sm text-slate-400">{ver.description || ver.agents?.description}</div>
                </div>
                <div className="text-sm text-slate-400">v{ver.version} • {new Date(ver.created_at).toLocaleDateString()}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
