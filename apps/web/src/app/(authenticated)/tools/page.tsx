import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { tools } from '@agent-workbench/sdk';

export default async function ToolsPage() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return <div className="p-6 text-red-400">Not authenticated</div>;

  const list = await tools.list(undefined, false);

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Tools</h1>
          <Link href="/tools/new" className="rounded bg-emerald-500 px-4 py-2 text-black">Create tool</Link>
        </div>

        <div className="mt-6 space-y-3">
          {list.map((tool: any) => (
            <Link
              key={tool.id}
              href={`/tools/${tool.id}`}
              className="block rounded border border-slate-700 bg-slate-900 p-4 hover:border-emerald-500"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{tool.name}</div>
                  <div className="text-sm text-slate-400">{tool.description}</div>
                </div>
                <div className="text-sm text-slate-400">{new Date(tool.created_at).toLocaleString()}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
