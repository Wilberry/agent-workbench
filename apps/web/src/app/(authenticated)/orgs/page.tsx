import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';

export default async function OrgsPage() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const { data: memberships, error } = await supabase
    .from('organization_memberships')
    .select('org_id, organizations(id, name, description)')
    .eq('user_id', user.id);

  const organizations = (memberships ?? []).map((membership: any) => membership.organizations);

  if (error) {
    return <div className="p-6 text-red-400">Failed to load organizations.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-3xl font-semibold">Organizations</h1>
          <p className="mt-2 text-slate-400">Select an organization to manage agents, runs, marketplace listings, and billing.</p>
        </div>

        {(!organizations || organizations.length === 0) ? (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
            You are not a member of any organization yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {organizations.map((org: any) => (
              <Link key={org.id} href={`/orgs/${org.id}/agents`} className="rounded-3xl border border-slate-700 bg-slate-900 p-6 hover:border-emerald-500">
                <h2 className="text-xl font-semibold text-white">{org.name}</h2>
                <p className="mt-2 text-slate-400">{org.description ?? 'Organization dashboard'}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
