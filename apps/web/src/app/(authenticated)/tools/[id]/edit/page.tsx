import ToolForm from '@/components/ToolForm';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { cookies, headers } from 'next/headers';
import { tools } from '@agent-workbench/sdk';

export default async function EditToolPage({ params }: { params: { id: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return <div className="p-6 text-red-400">Not authenticated</div>;

  const tool = await tools.get(params.id);
  if (!tool) return <div className="p-6 text-red-400">Tool not found</div>;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Edit Tool</h1>
        <div className="mt-4 rounded border border-slate-700 bg-slate-900 p-6">
          {/* Client form handles create; for update you'd POST to /api/tools/[id] but form currently only supports create */}
          <ToolForm initial={tool} />
        </div>
      </div>
    </main>
  );
}

