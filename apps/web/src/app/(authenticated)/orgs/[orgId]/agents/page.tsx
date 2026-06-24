import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { orgs } from '@agent-workbench/sdk';

export default async function OrgAgentsPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const orgAgents = await orgs.listOrgAgents(params.orgId, supabase);

  if (!orgAgents) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Could not load org agents.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Agents</h2>
        <p className="mt-1 text-slate-400">All agents created for this organization.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(orgAgents ?? []).map((agent: any) => (
          <Link key={agent.id} href={`/agents/${agent.id}`} className="rounded-3xl border border-slate-700 bg-slate-900 p-6 hover:border-emerald-500">
            <h3 className="text-xl font-semibold text-white">{agent.name}</h3>
            <p className="mt-2 text-slate-400">{agent.description ?? 'No description'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

