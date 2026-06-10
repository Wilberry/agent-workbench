import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import MarketplaceList from '@/components/MarketplaceList';

export default async function OrgMarketplacePage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: marketplaceItems, error } = await supabase
    .from('marketplace_agents')
    .select('*')
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Failed to load marketplace listings.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Organization Marketplace</h2>
        <p className="mt-1 text-slate-400">Manage published and private agent templates for this organization.</p>
      </div>
      <MarketplaceList items={(marketplaceItems ?? []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        visibility: item.visibility
      }))} />
    </div>
  );
}
