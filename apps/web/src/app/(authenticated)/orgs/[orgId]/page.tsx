import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export default async function OrgOverviewPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', params.orgId)
    .single();

  if (error || !org) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Organization not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">{org.name}</h2>
        <p className="mt-2 text-slate-400">{org.description ?? 'Organization overview and navigation.'}</p>
      </div>
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
