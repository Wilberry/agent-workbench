import Link from 'next/link';
import { githubUrl, Icon } from './data';

const groups = [
  {
    title: 'Product',
    links: [
      ['Product', '/#product'],
      ['Workflow', '/#workflow'],
      ['Roadmap', '/roadmap']
    ]
  },
  {
    title: 'Resources',
    links: [
      ['Documentation', '/docs'],
      ['GitHub', githubUrl],
      ['Contributing', '/contributing']
    ]
  },
  {
    title: 'Community',
    links: [
      ['Open Source', '/#open-source'],
      ['License', `${githubUrl}/blob/main/LICENSE`],
      ['Contact', '/contact']
    ]
  },
  {
    title: 'Company',
    links: [
      ['About', '/about'],
      ['Vision', '/about#vision'],
      ['Issues', `${githubUrl}/issues`]
    ]
  }
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 rounded-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/30"><Icon name="layers" /></span>
              Agent Workbench
            </Link>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-400">
              Open-source AgentOps infrastructure for building, evaluating, observing, and operating AI agents in production.
            </p>
            <p className="mt-5 text-sm text-slate-500">
              Built with Next.js, TypeScript, Tailwind CSS, Supabase, and PostgreSQL.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold text-white">{group.title}</h2>
                <ul className="mt-4 space-y-3">
                  {group.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="text-sm text-slate-400 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Agent Workbench. MIT Licensed.</p>
          <p>Production-grade AI infrastructure, developed in the open.</p>
        </div>
      </div>
    </footer>
  );
}
