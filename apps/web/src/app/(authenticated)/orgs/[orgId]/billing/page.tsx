import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function OrgBillingPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const { data: billing, error } = await supabase
    .from('org_billing')
    .select('*')
    .eq('org_id', params.orgId)
    .single();

  if (error) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Unable to load billing details.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="mt-1 text-slate-400">View plan usage and upgrade options for your organization.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Plan</div>
          <div className="mt-2 text-xl font-semibold text-white">{billing?.plan}</div>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Tokens Used</div>
          <div className="mt-2 text-xl font-semibold text-white">{billing?.tokens_used ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Runs Used</div>
          <div className="mt-2 text-xl font-semibold text-white">{billing?.runs_used ?? 0}</div>
        </div>
      </div>
    </div>
  );
}

