import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import OrgTraceAnalytics from '@/components/OrgTraceAnalytics';

type AgentRun = Database['public']['Tables']['agent_runs']['Row'];

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

  const orgRuns = (runs ?? []) as AgentRun[];

  return (
    <div className="space-y-6">
      <OrgTraceAnalytics orgId={params.orgId} runs={orgRuns} />

      <div className="space-y-3">
        {orgRuns.length === 0 ? (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">No organization runs yet.</div>
        ) : (
          orgRuns.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="block rounded-3xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-500 hover:bg-slate-800"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-white">Run {run.id.slice(0, 8)}</div>
                  <div className="text-sm text-slate-400">Workflow: {run.workflow?.join(' → ') ?? 'N/A'}</div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-sm text-slate-300">{run.status}</span>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-sm text-slate-300">{run.execution_trace?.length ?? 0} trace steps</span>
                  <span className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
