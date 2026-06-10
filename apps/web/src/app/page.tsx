import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
        <div className="rounded-[32px] border border-slate-800 bg-slate-900 p-10 shadow-xl shadow-slate-950/40">
          <h1 className="text-5xl font-semibold">Agent Workbench</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-400">
            Build, chat, and iterate on AI agents using a TypeScript monorepo with Next.js, Supabase, and streaming runtime support.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/login"
              className="rounded-2xl bg-emerald-500 px-6 py-4 text-center font-semibold text-slate-950"
            >
              Sign in
            </Link>
            <Link
              href="/agents"
              className="rounded-2xl border border-slate-700 px-6 py-4 text-center font-semibold text-slate-200"
            >
              View agents
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
