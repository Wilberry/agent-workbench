import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { orgs } from '@agent-workbench/sdk';
import type { Database } from '@/types/database';

async function createOrganization(formData: FormData) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const name = formData.get('name')?.toString().trim() ?? '';
  const slug = formData.get('slug')?.toString().trim() ?? '';
  const description = formData.get('description')?.toString().trim() ?? '';

  if (!name || !slug) {
    throw new Error('Name and slug are required');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  await orgs.createOrg(
    user.id,
    {
      name,
      slug,
      description: description || null
    },
    supabase
  );

  redirect('/orgs?success=true');
}

type Props = {
  searchParams: {
    success?: string;
  };
};

export default async function NewOrgPage({ searchParams }: Props) {
  const successMessage = searchParams.success ? 'Organization created successfully!' : null;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Create organization</h1>
              <p className="mt-2 text-slate-400">Create a new organization to manage agents, marketplace listings, and billing.</p>
            </div>
            <Link href="/orgs" className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500">
              Back to organizations
            </Link>
          </div>
        </div>

        {successMessage ? (
          <div className="rounded-3xl border border-emerald-500 bg-emerald-950/20 p-4 text-emerald-300">{successMessage}</div>
        ) : null}

        <form action={createOrganization} className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-200">Name</label>
            <input
              name="name"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="My organization"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Slug</label>
            <input
              name="slug"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="my-organization"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200">Description</label>
            <textarea
              name="description"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
              placeholder="Describe your organization"
              rows={4}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Create organization
          </button>
        </form>
      </div>
    </main>
  );
}
