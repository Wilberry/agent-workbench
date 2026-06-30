'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { githubUrl, Icon } from './data';

const links = [
  ['Home', '/'],
  ['Features', '/#features'],
  ['Docs', '/docs'],
  ['Roadmap', '/roadmap'],
  ['About', '/about'],
  ['Contact', '/contact']
] as const;
const linkClass = 'text-sm text-slate-300 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950';

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
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <Link href="#top" className="flex items-center gap-3 rounded-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/30"><Icon name="layers" /></span>
              <span>Agent Workbench</span>
            </Link>
            <div className="hidden items-center gap-7 md:flex">
              {links.map(([label, href]) => <Link key={label} href={href} className={linkClass}>{label}</Link>)}
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <Link href={githubUrl} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"><Icon name="github" /> GitHub</Link>
            </div>
            <button aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-xl border border-white/10 p-2 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 md:hidden">
              <span className="block h-0.5 w-5 bg-current"/><span className="mt-1.5 block h-0.5 w-5 bg-current"/><span className="mt-1.5 block h-0.5 w-5 bg-current"/>
            </button>
          </div>
          {open && <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:hidden">
            {links.map(([label, href]) => <Link onClick={() => setOpen(false)} key={label} href={href} className="rounded-xl px-3 py-2 text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">{label}</Link>)}
            <Link href={githubUrl} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"><Icon name="github" /> GitHub</Link>
          </div>}
        </div>
      </nav>
    </header>
  );
}
