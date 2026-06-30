import Link from 'next/link';
import { Navbar } from './Navbar';
import { PublicFooter } from './PublicFooter';
import { githubUrl, Icon, roadmap } from './data';

export function PublicPage({ title, eyebrow, description, children }: { title: string; eyebrow: string; description: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <Navbar />
      <section className="relative overflow-hidden pt-36 sm:pt-44">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,.08)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">{eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-white sm:text-6xl">{title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{description}</p>
        </div>
      </section>
      {children}
      <PublicFooter />
    </main>
  );
}

export function ContentSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="py-10"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2><div className="mt-6">{children}</div></div></section>;
}

export function InfoCard({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  const body = <div className="h-full rounded-3xl border border-white/10 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-cyan-300/40"><h3 className="text-lg font-semibold text-white">{title}</h3><div className="mt-3 text-sm leading-6 text-slate-400">{children}</div>{href ? <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Read more <Icon name="arrow" /></p> : null}</div>;
  return href ? <a href={href}>{body}</a> : body;
}

export const sharedLinks = { githubUrl, roadmap };
