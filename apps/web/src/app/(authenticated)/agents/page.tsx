import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export default async function AgentsPage() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, description, created_at')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Your agents</h1>
            <p className="text-slate-400">Manage your AI agents and open a chat session.</p>
          </div>
        </div>

        <div className="space-y-4">
          {(agents ?? []).map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="block rounded-3xl border border-slate-700 bg-slate-900 p-6 transition hover:border-slate-500"
            >
              <div className="text-xl font-semibold">{agent.name}</div>
              <p className="mt-2 text-slate-400">{agent.description ?? 'No description provided.'}</p>
            </Link>
          ))}

          {(agents ?? []).length === 0 ? (
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
              You have no agents yet. Create one through your Supabase dashboard or future UI flows.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
