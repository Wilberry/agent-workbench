'use client';

import Link from 'next/link';

export default function OrgNavigation({ orgId }: { orgId: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      <Link href={`/orgs/${orgId}/agents`} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-emerald-500">
        Agents
      </Link>
      <Link href={`/orgs/${orgId}/runs`} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-emerald-500">
        Runs
      </Link>
      <Link href={`/orgs/${orgId}/marketplace`} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-emerald-500">
        Marketplace
      </Link>
      <Link href={`/orgs/${orgId}/traces`} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-emerald-500">
        Traces
      </Link>
      <Link href={`/orgs/${orgId}/billing`} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-emerald-500">
        Billing
      </Link>
    </nav>
  );
}
