import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns, orgs } from '@agent-workbench/sdk';
import type { OrgBilling } from '@agent-workbench/sdk';
import OrgTraceAnalytics from '@/components/OrgTraceAnalytics';

export default async function OrgOverviewPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Not authenticated.</div>;
  }

  const [org, orgRuns, orgAgents, marketplaceItems, telemetry, billing] = await Promise.all([
    orgs.getOrg(params.orgId, supabase),
    agentRuns.listOrgRuns(params.orgId, 20, supabase),
    orgs.listOrgAgents(params.orgId, supabase),
    orgs.listOrgMarketplaceAgents(params.orgId, supabase),
    agentRuns.orgTelemetry(params.orgId, supabase),
    orgs.getBilling(params.orgId, supabase)
  ]);

  const statusCounts = orgRuns.reduce(
    (acc, run) => {
      acc[run.status] = (acc[run.status] ?? 0) + 1;
      return acc;
    },
    {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0
    } as Record<'pending' | 'running' | 'completed' | 'failed', number>
  );

  const recentRuns = orgRuns.slice(0, 4);

  if (!org) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Organization not found.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">{org.name}</h1>
              <p className="mt-2 text-slate-400">{org.description ?? 'Organization overview and navigation.'}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/orgs/${org.id}/agents`}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
              >
                View agents
              </Link>
              <Link
                href={`/orgs/${org.id}/marketplace`}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
              >
                Marketplace
              </Link>
              <Link
                href={`/orgs/${org.id}/billing`}
                className="rounded-2xl border border-slate-700 bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Billing
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-950 p-4 text-center">
                <div className="text-sm text-slate-400">Agents</div>
                <div className="mt-2 text-3xl font-semibold text-white">{orgAgents.length}</div>
              </div>
              <div className="rounded-3xl bg-slate-950 p-4 text-center">
                <div className="text-sm text-slate-400">Marketplace listings</div>
                <div className="mt-2 text-3xl font-semibold text-white">{marketplaceItems.length}</div>
              </div>
              <div className="rounded-3xl bg-slate-950 p-4 text-center">
                <div className="text-sm text-slate-400">Recent runs</div>
                <div className="mt-2 text-3xl font-semibold text-white">{orgRuns.length}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-950 p-4 text-center">
                <div className="text-sm text-slate-400">Total tokens</div>
                <div className="mt-2 text-xl font-semibold text-white">{telemetry.total_tokens}</div>
              </div>
              <div className="rounded-3xl bg-slate-950 p-4 text-center">
                <div className="text-sm text-slate-400">Cost</div>
                <div className="mt-2 text-xl font-semibold text-white">${telemetry.total_estimated_cost.toFixed(4)}</div>
              </div>
              <div className="rounded-3xl bg-slate-950 p-4 text-center">
                <div className="text-sm text-slate-400">Avg. latency</div>
                <div className="mt-2 text-xl font-semibold text-white">{telemetry.average_latency_ms}ms</div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(['pending', 'running', 'completed', 'failed'] as const).map((status) => (
                <div key={status} className="rounded-3xl bg-slate-950 p-4 text-center">
                  <div className="text-sm text-slate-400">{status.charAt(0).toUpperCase() + status.slice(1)}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{statusCounts[status]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold text-white">Organization details</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div>
                <div className="text-slate-400">Slug</div>
                <div className="mt-1 text-white">{org.slug}</div>
              </div>
              <div>
                <div className="text-slate-400">Created</div>
                <div className="mt-1 text-white">{new Date(org.created_at).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-slate-400">Agents in marketplace</div>
                <div className="mt-1 text-white">{marketplaceItems.length}</div>
              </div>
              <div>
                <div className="text-slate-400">Agents in org</div>
                <div className="mt-1 text-white">{orgAgents.length}</div>
              </div>
              <div>
                <div className="text-slate-400">Billing plan</div>
                <div className="mt-1 text-white">{billing?.plan ?? 'Unknown'}</div>
              </div>
              <div>
                <div className="text-slate-400">Runs used</div>
                <div className="mt-1 text-white">{billing?.runs_used ?? 0}</div>
              </div>
              <div>
                <div className="text-slate-400">Tokens used</div>
                <div className="mt-1 text-white">{billing?.tokens_used ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <OrgTraceAnalytics orgId={params.orgId} runs={orgRuns} />

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recent runs</h2>
              <p className="text-sm text-slate-400">Latest activity for this organization.</p>
            </div>
            <Link
              href={`/orgs/${org.id}/runs`}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              View all runs
            </Link>
          </div>

          {recentRuns.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-400">No recent runs for this organization.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {recentRuns.map((run) => (
                <div key={run.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-white">Run {run.id.slice(0, 8)}</div>
                      <div className="text-sm text-slate-400">{new Date(run.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200">{run.status}</span>
                      <span className="rounded-2xl bg-slate-800 px-3 py-1 text-sm text-slate-200">{run.workflow?.length ?? 0} steps</span>
                      <span className="rounded-2xl bg-slate-800 px-3 py-1 text-sm text-slate-200">{run.total_tokens} tokens</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

