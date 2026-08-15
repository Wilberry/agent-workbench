'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { githubUrl, Icon } from './data';

const links = [
  ['Product', '/#features'],
  ['Production', '/#production'],
  ['Use cases', '/#use-cases'],
  ['Collaborate', '/#collaborate'],
  ['Docs', '/docs'],
  ['Roadmap', '/roadmap']
] as const;

const linkClass = 'text-sm font-medium text-slate-400 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all ${scrolled ? 'py-2' : 'py-4'}`}>
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className={`rounded-2xl border px-4 py-3 backdrop-blur-xl transition ${scrolled ? 'border-white/10 bg-slate-950/90 shadow-2xl shadow-black/30' : 'border-white/[.08] bg-slate-950/65'}`}>
          <div className="flex items-center justify-between gap-4">
            <Link href="/#top" className="flex items-center gap-3 rounded-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><Icon name="layers" /></span>
              <span>Agent Workbench</span>
            </Link>

            <div className="hidden items-center gap-6 lg:flex">
              {links.map(([label, href]) => <Link key={label} href={href} className={linkClass}>{label}</Link>)}
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <Link href={githubUrl} aria-label="View Agent Workbench on GitHub" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                <Icon name="github" />
              </Link>
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                Get started <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>

            <button aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-xl border border-white/10 p-2 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 md:hidden">
              <span className="block h-0.5 w-5 bg-current"/><span className="mt-1.5 block h-0.5 w-5 bg-current"/><span className="mt-1.5 block h-0.5 w-5 bg-current"/>
            </button>
          </div>

          {open && (
            <div className="mt-4 grid gap-1 border-t border-white/10 pt-4 md:hidden">
              {links.map(([label, href]) => (
                <Link onClick={() => setOpen(false)} key={label} href={href} className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                  {label}
                </Link>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/[.06] focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                  <Icon name="github" /> GitHub
                </Link>
                <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                  Get started <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
