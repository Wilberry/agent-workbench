import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import type { Agent } from '@agent-workbench/sdk';

async function updateAgent(formData: FormData, agentId: string) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const name = formData.get('name')?.toString() ?? '';
  const description = formData.get('description')?.toString() ?? '';
  const system_prompt = formData.get('system_prompt')?.toString() ?? '';
  const model = formData.get('model')?.toString() ?? 'gpt-4o-mini';

  if (!name || !system_prompt) {
    throw new Error('Name and system prompt are required');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const { error } = await supabase
    .from('agents')
    .update({
      name,
      description: description || null,
      system_prompt,
      model
    })
    .eq('id', agentId)
    .eq('user_id', user.id);

  if (error) {
    throw error;
  }

  redirect(`/agents/${agentId}`);
}

async function deleteAgent(_: FormData, agentId: string) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const { error } = await supabase.from('agents').delete().eq('id', agentId).eq('user_id', user.id);

  if (error) {
    throw error;
  }

  redirect('/agents');
}

type Props = {
  params: {
    id: string;
  };
};

export default async function EditAgentPage({ params }: Props) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-red-400">Not authenticated</div>;
  }

  const { data: agent, error } = await supabase
    .from<Agent>('agents')
    .select('id, name, description, system_prompt, model')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !agent) {
    return <div className="p-6 text-red-400">Agent not found.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Edit {agent.name}</h1>
              <p className="text-slate-400">Update this agent&apos;s prompt, description, and model.</p>
            </div>
            <a
              href={`/agents/${agent.id}`}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Back to agent
            </a>
          </div>
        </div>

        <form action={async (formData: FormData) => updateAgent(formData, params.id)} className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-200">Name</label>
            <input
              name="name"
              defaultValue={agent.name}
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Description</label>
            <textarea
              name="description"
              defaultValue={agent.description ?? undefined}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">System prompt</label>
            <textarea
              name="system_prompt"
              defaultValue={agent.system_prompt}
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              rows={6}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Model</label>
            <input
              name="model"
              defaultValue={agent.model}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Save changes
            </button>

            <button
              type="button"
              formAction={async (formData: FormData) => deleteAgent(formData, params.id)}
              className="w-full rounded-2xl border border-red-700 bg-red-900 px-4 py-3 text-sm font-semibold text-red-200 transition hover:border-red-500"
            >
              Delete agent
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

