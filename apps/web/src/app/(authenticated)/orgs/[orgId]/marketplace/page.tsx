import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { orgs, marketplace } from '@agent-workbench/sdk';
import MarketplaceList from '@/components/MarketplaceList';
import InstalledAgentsList from '@/components/InstalledAgentsList';

export default async function OrgMarketplacePage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const [org, orgMarketplaceListings, publicMarketplace, installedAgents] = await Promise.all([
    orgs.getOrg(params.orgId, supabase),
    orgs.listOrgMarketplaceAgents(params.orgId, supabase),
    marketplace.listPublicAgentVersions(50, supabase),
    marketplace.listOrgInstalledAgents(params.orgId, supabase)
  ]);

  if (!org) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Organization not found.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Marketplace</h1>
              <p className="mt-2 text-slate-400">Browse, install, and fork agents from the marketplace.</p>
            </div>
            <Link
              href={`/orgs/${org.id}/agents`}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              View org agents
            </Link>
          </div>
        </div>

        {installedAgents && installedAgents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Installed Agents</h2>
            <p className="text-slate-400">Agents installed in this organization from the marketplace.</p>
            <InstalledAgentsList items={installedAgents} orgId={params.orgId} />
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">Public Marketplace</h2>
          <p className="text-slate-400">Available agents for installation and forking.</p>
          <MarketplaceList items={(publicMarketplace ?? []).map((item: any) => ({
            id: item.id,
            name: item.agents?.name || 'Unnamed agent',
            description: item.description || item.agents?.description,
            visibility: 'public',
            versionId: item.id
          }))} orgId={params.orgId} />
        </div>

        {orgMarketplaceListings && orgMarketplaceListings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Organization Marketplace</h2>
            <p className="text-slate-400">Agents published by this organization for internal use.</p>
            <MarketplaceList items={(orgMarketplaceListings ?? []).map((item: any) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              visibility: item.visibility
            }))} />
          </div>
        )}
      </div>
    </main>
  );
}


