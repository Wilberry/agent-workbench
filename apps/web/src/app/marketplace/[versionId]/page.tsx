import { marketplace } from '@agent-workbench/sdk';
import Link from 'next/link';

type Props = { params: { versionId: string } };

export default async function MarketAgentDetail({ params }: Props) {
  const version = await marketplace.getAgentVersion(params.versionId);
  if (!version) return <div className="p-6 text-red-400">Agent version not found</div>;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{version.agents?.name}</h1>
            <div className="text-sm text-slate-400">v{version.version}</div>
          </div>
          <Link href="/marketplace" className="text-sm text-slate-500">Back</Link>
        </div>

        <div className="mt-4 rounded border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-300">{version.description}</div>
          <div className="mt-4 text-xs text-slate-500">Created: {new Date(version.created_at).toLocaleString()}</div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-semibold">System Prompt</h2>
          <pre className="mt-2 rounded bg-slate-950 p-4 text-sm text-slate-100 whitespace-pre-wrap">{version.system_prompt}</pre>
        </div>
      </div>
    </main>
  );
}
