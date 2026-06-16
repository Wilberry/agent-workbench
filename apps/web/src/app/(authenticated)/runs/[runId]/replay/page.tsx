import RunDetailClient from '@/components/RunDetailClient';
import ReplayPlayer from '@/components/ReplayPlayer';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { cookies, headers } from 'next/headers';
import { agentRuns } from '@agent-workbench/sdk';

export default async function RunReplayPage({ params }: { params: { runId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return <div className="p-6 text-red-400">Not authenticated</div>;

  const run = await agentRuns.get(params.runId);
  if (!run) return <div className="p-6 text-red-400">Run not found</div>;

  const trace = run.execution_trace || [];

  return (
    <main className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Replay: {run.id}</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            {/* Client-side player */}
            {/* @ts-ignore */}
            <ReplayPlayer runId={run.id} />
          </div>
          <div>
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4">
              <div className="text-sm text-slate-300">Run Metadata</div>
              <div className="mt-2 text-sm text-slate-400">
                <div>Created: {new Date(run.created_at).toLocaleString()}</div>
                <div>Status: {run.status}</div>
                <div>Current step: {run.current_step}</div>
              </div>
            </div>

            <div className="mt-4">
              {/* Client subscribe component to see live updates */}
              {/* @ts-ignore */}
              <RunDetailClient runId={run.id} initialTrace={trace} initialStatus={run.status} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

