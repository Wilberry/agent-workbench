import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export default async function AgentsPage({ searchParams }: { searchParams: { success?: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, description, created_at')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false });

  const typedAgents = (agents ?? []) as Array<{ id: string; name: string; description: string | null; created_at: string }>;

  const successMessage = searchParams.success ? 'Agent created successfully!' : null;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Your agents</h1>
            <p className="text-slate-400">Manage your AI agents and open a chat session.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/conversations"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
            >
              View conversations
            </a>
            <a
              href="/agents/new"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Create new agent
            </a>
          </div>
        </div>

        {successMessage ? (
          <div className="mb-6 rounded-3xl border border-emerald-500 bg-emerald-950/20 p-4 text-emerald-300">
            {successMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          {typedAgents.map((agent) => (
            <div key={agent.id} className="rounded-3xl border border-slate-700 bg-slate-900 p-6 transition hover:border-slate-500">
              <Link href={`/agents/${agent.id}`} className="block">
                <div className="text-xl font-semibold">{agent.name}</div>
                <p className="mt-2 text-slate-400">{agent.description ?? 'No description provided.'}</p>
              </Link>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/agents/${agent.id}/edit`}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
                >
                  Edit
                </Link>
                <Link
                  href={`/agents/${agent.id}`}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
                >
                  Open chat
                </Link>
              </div>
            </div>
          ))}

          {typedAgents.length === 0 ? (
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
              You have no agents yet. Create one from the button above.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
