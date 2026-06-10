import OrgNavigation from '@/components/OrgNavigation';
import type { ReactNode } from 'react';

export default function OrgLayout({ children, params }: { children: ReactNode; params: { orgId: string } }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Organization Dashboard</h1>
              <p className="mt-2 text-slate-400">Manage agents, runs, marketplace listings, and billing for this org.</p>
            </div>
            <OrgNavigation orgId={params.orgId} />
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
