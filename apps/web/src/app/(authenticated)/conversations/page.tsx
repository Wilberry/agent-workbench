import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

type ConversationWithAgent = Database['public']['Tables']['conversations']['Row'] & {
  agent?: {
    id: string;
    name: string;
  }[];
};

export default async function ConversationsPage() {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: conversations, error } = await supabase
    .from<ConversationWithAgent>('conversations')
    .select('id, title, agent_id, created_at, agents(id, name)')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-700 bg-slate-900 p-6 text-red-300">
          <p>Could not load conversations.</p>
          <pre className="whitespace-pre-wrap text-sm text-red-200">{error.message}</pre>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Conversations</h1>
              <p className="text-slate-400">Review your saved chats and continue any conversation.</p>
            </div>
            <Link
              href="/agents"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              View agents
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {(conversations ?? []).map((conversation) => {
            const agentName = conversation.agent?.[0]?.name ?? conversation.agent_id;
            return (
              <Link
                key={conversation.id}
                href={`/conversations/${conversation.id}`}
                className="block rounded-3xl border border-slate-700 bg-slate-900 p-6 transition hover:border-slate-500"
              >
                <div className="text-lg font-semibold">{conversation.title ?? `Conversation with ${agentName}`}</div>
                <p className="mt-2 text-slate-400">Agent: {agentName}</p>
                <p className="mt-2 text-sm text-slate-500">{new Date(conversation.created_at).toLocaleString()}</p>
              </Link>
            );
          })}

          {(conversations ?? []).length === 0 ? (
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
              No conversations yet. Start a chat by opening one of your agents.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
