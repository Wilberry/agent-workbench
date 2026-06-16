import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import SignOutButton from '@/components/SignOutButton';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <nav className="flex flex-wrap items-center gap-3">
            <Link
              href="/agents"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
            >
              Agents
            </Link>
            <Link
              href="/conversations"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
            >
              Conversations
            </Link>
            <Link
              href="/traces"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
            >
              Traces
            </Link>
            <Link
              href="/runs"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500"
            >
              Runs
            </Link>
          </nav>
          <SignOutButton />
        </div>
      </header>
      <main className="px-4 py-6">{children}</main>
    </div>
  );
}
