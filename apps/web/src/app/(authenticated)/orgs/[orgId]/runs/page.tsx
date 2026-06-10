import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export default async function OrgRunsPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: runs, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('organization_id', params.orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Could not load org runs.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Organization Runs</h2>
        <p className="mt-1 text-slate-400">All runs created by the org.</p>
      </div>
      <div className="space-y-3">
        {(runs ?? []).map((run: any) => (
          <Link key={run.id} href={`/runs/${run.id}`} className="block rounded-3xl border border-slate-700 bg-slate-900 p-4 hover:border-emerald-500">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Run {run.id.slice(0, 8)}</div>
                <p className="text-sm text-slate-400">Status: {run.status}</p>
              </div>
              <div className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
