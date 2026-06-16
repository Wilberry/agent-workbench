import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { cookies, headers } from 'next/headers';
import { tools } from '@agent-workbench/sdk';
import Link from 'next/link';

type Props = { params: { id: string } };

export default async function ToolDetailPage({ params }: Props) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return <div className="p-6 text-red-400">Not authenticated</div>;

  const tool = await tools.get(params.id);
  if (!tool) return <div className="p-6 text-red-400">Tool not found</div>;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{tool.name}</h1>
          <div className="text-sm text-slate-400">{tool.public ? 'Public' : 'Private'}</div>
        </div>

        <div className="mt-4 rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-300">{tool.description}</div>
          <div className="mt-3 text-xs text-slate-500">Entrypoint: {tool.entrypoint}</div>
          <div className="mt-3 text-xs text-slate-500">Created: {new Date(tool.created_at).toLocaleString()}</div>
        </div>

        <div className="mt-4">
          <Link href={`/tools/${params.id}/edit`} className="rounded bg-emerald-500 px-4 py-2 text-black">
            Edit
          </Link>
          <Link href="/tools" className="ml-3 rounded border px-3 py-2 text-sm">Back</Link>
        </div>
      </div>
    </main>
  );
}

