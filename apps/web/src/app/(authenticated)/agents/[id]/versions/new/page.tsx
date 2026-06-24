import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { agents } from '@agent-workbench/sdk';
import type { Database } from '@/types/database';

async function createVersion(formData: FormData, agentId: string) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const name = formData.get('version')?.toString().trim() ?? '';
  const description = formData.get('description')?.toString().trim() ?? '';
  const system_prompt = formData.get('system_prompt')?.toString() ?? '';
  const model = formData.get('model')?.toString() ?? '';
  const workflow = formData.get('workflow')?.toString().split(',').map((item) => item.trim()).filter(Boolean) ?? [];

  if (!system_prompt) {
    throw new Error('System prompt is required');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const agent = await agents.get(agentId, supabase);
  if (!agent) {
    throw new Error('Agent not found');
  }

  const nextVersion = await agents.createVersion(agentId, user.id, {
    version: name || undefined,
    description: description || undefined,
    system_prompt: system_prompt || undefined,
    model: model || undefined,
    workflow: workflow.length ? workflow : undefined
  }, supabase);

  redirect(`/agents/${agentId}?versionCreated=true`);
}

type Props = {
  params: {
    id: string;
  };
  searchParams: {
    versionCreated?: string;
  };
};

export default async function NewVersionPage({ params, searchParams }: Props) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const agent = await agents.get(params.id, supabase);
  const error = !agent ? new Error('Agent not found') : null;

  if (error || !agent) {
    return <div className="p-6 text-red-400">Agent not found.</div>;
  }

  const successMessage = searchParams.versionCreated ? 'Version created successfully!' : null;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Create version for {agent.name}</h1>
              <p className="mt-2 text-slate-400">Create a new version from the current agent configuration.</p>
            </div>
            <Link href={`/agents/${params.id}`} className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
              Back to agent
            </Link>
          </div>
        </div>

        {successMessage ? (
          <div className="rounded-3xl border border-emerald-500 bg-emerald-950/20 p-4 text-emerald-300">{successMessage}</div>
        ) : null}

        <form action={async (formData: FormData) => createVersion(formData, params.id)} className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-200">Version label</label>
            <input
              name="version"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="v2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Description</label>
            <textarea
              name="description"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="What's new in this version?"
              rows={4}
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
              placeholder="gpt-4o-mini"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Workflow</label>
            <input
              name="workflow"
              defaultValue="Planner,Executor,Reviewer"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="Planner,Executor,Reviewer"
            />
            <p className="mt-2 text-sm text-slate-500">Comma-separated step names.</p>
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Create version
          </button>
        </form>
      </div>
    </main>
  );
}
