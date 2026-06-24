import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import AgentChat from '@/components/AgentChat';
import { conversations as conversationSdk } from '@agent-workbench/sdk';

type Props = {
  params: {
    id: string;
  };
};

export default async function ConversationPage({ params }: Props) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const conversation = await conversationSdk.get(params.id, supabase);

  if (!conversation || conversation.user_id !== user?.id) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-700 bg-slate-900 p-6 text-red-300">
          <p>Conversation not found or access denied.</p>
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
              <h1 className="text-3xl font-semibold">{conversation.title ?? 'Conversation'}</h1>
              <p className="mt-2 text-slate-400">Continue your chat with this agent.</p>
            </div>
            <a
              href="/conversations"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Back to conversations
            </a>
          </div>
        </div>

        <AgentChat agentId={conversation.agent_id} conversationId={conversation.id} />
      </div>
    </main>
  );
}

