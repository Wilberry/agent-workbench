import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agentRuns } from '@agent-workbench/sdk';
import type { AgentRunStatus } from '@agent-workbench/sdk';

type AgentRun = {
  id: string;
  user_id: string;
  conversation_id: string;
  workflow: string[];
  current_step: number;
  status: AgentRunStatus;
  created_at: string;
  error_message?: string | null;
};

export default async function RunsPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const runs = await agentRuns.listByUser(user.id, 100);

  const statusColors = {
    pending: 'bg-yellow-900 text-yellow-100',
    running: 'bg-blue-900 text-blue-100',
    completed: 'bg-emerald-900 text-emerald-100',
    failed: 'bg-red-900 text-red-100',
    cancelled: 'bg-slate-700 text-slate-200'
  } satisfies Record<AgentRunStatus, string>;

  const runCounts = runs.reduce(
    (acc, run) => {
      acc.total += 1;
      if (run.status === 'completed') acc.completed += 1;
      if (run.status === 'running') acc.running += 1;
      if (run.status === 'pending') acc.pending += 1;
      if (run.status === 'failed') acc.failed += 1;
      if (run.status === 'cancelled') acc.cancelled += 1;
      return acc;
    },
    { total: 0, completed: 0, running: 0, pending: 0, failed: 0, cancelled: 0 }
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-3xl font-semibold">Agent Runs</h1>
          <p className="mt-2 text-slate-400">Track all workflow executions and their status.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-6">
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <div className="font-semibold text-slate-300">Total runs</div>
              <div className="mt-2 text-3xl font-semibold text-white">{runCounts.total}</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <div className="font-semibold text-slate-300">Completed</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-200">{runCounts.completed}</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <div className="font-semibold text-slate-300">Running</div>
              <div className="mt-2 text-3xl font-semibold text-blue-200">{runCounts.running}</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <div className="font-semibold text-slate-300">Pending</div>
              <div className="mt-2 text-3xl font-semibold text-yellow-200">{runCounts.pending}</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <div className="font-semibold text-slate-300">Failed</div>
              <div className="mt-2 text-3xl font-semibold text-red-200">{runCounts.failed}</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <div className="font-semibold text-slate-300">Cancelled</div>
              <div className="mt-2 text-3xl font-semibold text-slate-200">{runCounts.cancelled}</div>
            </div>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-400">
            No runs yet. Start a conversation with an agent to create your first run.
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run: AgentRun) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="block rounded-3xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-500 hover:bg-slate-800"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <div className="font-semibold text-slate-100">Workflow</div>
                      <div className="flex space-x-2">
                        {(run.workflow as string[]).map((role) => (
                          <span
                            key={role}
                            className="inline-block rounded bg-slate-700 px-2 py-1 text-xs text-slate-100"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-slate-400">
                      Step {run.current_step} / {(run.workflow as string[]).length}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-2">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                        statusColors[run.status as keyof typeof statusColors] ||
                        'bg-slate-700 text-slate-100'
                      }`}
                    >
                      {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                    </span>
                    {run.error_message && (
                      <div className="text-xs text-red-400 max-w-xs text-right">{run.error_message}</div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
