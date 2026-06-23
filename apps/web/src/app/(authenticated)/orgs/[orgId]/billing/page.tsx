import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns, orgs } from '@agent-workbench/sdk';

export default async function OrgBillingPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const billing = await orgs.getBilling(params.orgId, supabase);
  const telemetry = await agentRuns.orgTelemetry(params.orgId, supabase);

  if (!billing || !telemetry) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Unable to load billing details.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="mt-1 text-slate-400">View plan usage and upgrade options for your organization.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Plan</div>
          <div className="mt-2 text-xl font-semibold text-white">{billing?.plan}</div>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Tokens Used</div>
          <div className="mt-2 text-xl font-semibold text-white">{billing?.tokens_used ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Estimated spend</div>
          <div className="mt-2 text-xl font-semibold text-white">${telemetry.total_estimated_cost.toFixed(4)}</div>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Runs Executed</div>
          <div className="mt-2 text-xl font-semibold text-white">{telemetry.total_runs}</div>
        </div>
      </div>
    </div>
  );
}

