import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import OrgTraceAnalytics from '@/components/OrgTraceAnalytics';

export default async function OrgOverviewPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', params.orgId)
    .single();

  const { data: runs } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('organization_id', params.orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (orgError || !org) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Organization not found.</div>;
  }

  const orgRuns = (runs ?? []) as Database['public']['Tables']['agent_runs']['Row'][];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">{org.name}</h2>
        <p className="mt-2 text-slate-400">{org.description ?? 'Organization overview and navigation.'}</p>
      </div>
      <OrgTraceAnalytics orgId={params.orgId} runs={orgRuns} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Slug</div>
          <div className="mt-2 text-lg text-white">{org.slug}</div>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Created</div>
          <div className="mt-2 text-lg text-white">{new Date(org.created_at).toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}

