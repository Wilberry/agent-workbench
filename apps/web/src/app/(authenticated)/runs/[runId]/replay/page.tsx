import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { db } from '@/lib/db';
import { agentRuns } from '@agent-workbench/sdk';
import { conversations as conversationSdk } from '@agent-workbench/sdk';
import ReplayButton from '@/components/ReplayButton';

type Params = {
  params: {
    runId: string;
  };
};

export default async function ReplayPage({ params }: Params) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated.</div>;
  }

  const run = await agentRuns.get(params.runId, supabase);

  if (!run || run.user_id !== user.id) {
    return <div className="p-6 text-red-400">Run not found or access denied.</div>;
  }

  const conversation = await conversationSdk.get(run.conversation_id, supabase);

  if (!conversation || conversation.user_id !== user.id) {
    return <div className="p-6 text-red-400">Run not found or access denied.</div>;
  }

  const agentId = conversation.agent_id;
  const versions = await db.agents.listVersions(agentId);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href={`/runs/${run.id}`} className="text-slate-400 transition hover:text-slate-100">
          ← Back to run
        </Link>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-3xl font-semibold">Replay Run</h1>
          <p className="mt-2 text-slate-400">
            Create a new run using a different agent version to compare results or test improvements.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">Original Run</h2>
            <div className="space-y-2 text-sm text-slate-400">
              <div>
                <span className="font-semibold text-slate-200">Run ID:</span> {run.id}
              </div>
              <div>
                <span className="font-semibold text-slate-200">Status:</span> {run.status}
              </div>
              <div>
                <span className="font-semibold text-slate-200">Created:</span>{' '}
                {new Date(run.created_at).toLocaleString()}
              </div>
              {run.input_tokens && (
                <div>
                  <span className="font-semibold text-slate-200">Tokens:</span> {run.input_tokens} input,{' '}
                  {run.output_tokens} output
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-700 pt-6">
            <h2 className="mb-4 text-lg font-semibold">Create Replay</h2>
            <ReplayButton run={run} versions={versions || []} />
          </div>
        </div>
      </div>
    </main>
  );
}


