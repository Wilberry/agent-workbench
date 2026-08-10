import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agents } from '@agent-workbench/sdk';
import type { Database } from '@/types/database';
import ProviderModelFields from '@/components/ProviderModelFields';
import {
  assertSelectableProviderModel,
  getModelProviderCatalog
} from '@/lib/modelProviderCatalog';

async function createAgent(formData: FormData) {
  'use server';

  const supabase = createServerComponentSupabaseClient({ headers, cookies });
  const name = formData.get('name')?.toString() ?? '';
  const description = formData.get('description')?.toString() ?? '';
  const system_prompt = formData.get('system_prompt')?.toString() ?? '';
  const selection = assertSelectableProviderModel(
    formData.get('provider')?.toString(),
    formData.get('model')?.toString()
  );

  if (!name || !system_prompt) {
    throw new Error('Name and system prompt are required');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const agent = await agents.create(
    user.id,
    {
      name,
      description: description || undefined,
      system_prompt,
      provider: selection.provider,
      model: selection.model
    },
    null,
    supabase
  );

  if (!agent) {
    throw new Error('Failed to create agent');
  }

  redirect('/agents?success=true');
}

type Props = {
  searchParams: { success?: string };
};

export default async function NewAgentPage({ searchParams }: Props) {
  const successMessage = searchParams.success ? 'Agent created successfully!' : null;
  const providerCatalog = getModelProviderCatalog();
  const hasConfiguredProvider = providerCatalog.some(
    (provider) => provider.configured && provider.models.length > 0
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Create new agent</h1>
              <p className="mt-2 text-slate-400">Define your agent, prompt, provider, and model settings.</p>
            </div>
            <Link href="/agents" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
              Back to agents
            </Link>
          </div>
        </div>

        {successMessage ? (
          <div className="rounded-3xl border border-emerald-500 bg-emerald-950/20 p-4 text-emerald-300">{successMessage}</div>
        ) : null}

        <form action={createAgent} className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-200">Name</label>
            <input
              name="name"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="My support agent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Description</label>
            <textarea
              name="description"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="Brief description for your agent"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">System prompt</label>
            <textarea
              name="system_prompt"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="You are a helpful assistant..."
              rows={6}
            />
          </div>

          <ProviderModelFields catalog={providerCatalog} />

          <button
            type="submit"
            disabled={!hasConfiguredProvider}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create agent
          </button>
        </form>
      </div>
    </main>
  );
}
