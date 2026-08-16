import Image from 'next/image';
import Link from 'next/link';
import { Footer } from '@/components/landing/Sections';
import { Navbar } from '@/components/landing/Navbar';
import { githubUrl, Icon } from '@/components/landing/data';

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Agent Workbench',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: 'Open-source infrastructure for evaluating, observing, and operating production AI agents.',
    license: 'https://opensource.org/license/mit',
    codeRepository: 'https://github.com/wilberry/agent-workbench'
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Agent Workbench',
    url: 'https://agent-workbench.dev',
    sameAs: ['https://github.com/wilberry/agent-workbench']
  }
];

const capabilities = [
  {
    icon: 'test' as const,
    eyebrow: 'Evaluate',
    title: 'Know what improved before you ship.',
    description: 'Run repeatable datasets, compare agent versions, and catch regressions before they reach production.'
  },
  {
    icon: 'activity' as const,
    eyebrow: 'Observe',
    title: 'See the full story behind every run.',
    description: 'Inspect traces, failures, latency, token usage, and cost from one operational view.'
  },
  {
    icon: 'queue' as const,
    eyebrow: 'Operate',
    title: 'Give agent execution production-grade reliability.',
    description: 'Use durable queues, retries, recovery, and dead-letter handling instead of fragile background glue.'
  }
] as const;

const workflow = [
  ['01', 'Version', 'Change prompts, models, tools, and configuration with history.'],
  ['02', 'Evaluate', 'Benchmark quality and compare changes against real datasets.'],
  ['03', 'Run', 'Execute through durable workflows built for failure and recovery.'],
  ['04', 'Learn', 'Use traces, latency, quality, and cost to guide the next release.']
] as const;

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.16),transparent_62%)] blur-3xl" aria-hidden="true" />
      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
        <div className="overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-slate-950">
          <Image
            src="/images/agent-workbench-dashboard.webp"
            alt="Agent Workbench dashboard showing agents, evaluations, traces, queue health, cost analytics, and latency"
            width={1586}
            height={992}
            priority
            quality={90}
            sizes="(max-width: 1024px) calc(100vw - 2rem), 1100px"
            className="h-auto w-full"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500 sm:text-sm">
        <span>Open source</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>TypeScript</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>PostgreSQL + Supabase</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>MIT licensed</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />

      <section id="top" className="relative isolate overflow-hidden pt-28 sm:pt-36 lg:pt-40">
        <div className="absolute inset-0 -z-20 bg-slate-950" />
        <div className="absolute left-1/2 top-0 -z-10 h-[650px] w-[900px] -translate-x-1/2 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_68%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[780px] opacity-20 [background-image:linear-gradient(rgba(148,163,184,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.09)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3.5 py-2 text-sm font-medium text-cyan-100">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,.9)]" />
              Open-source AgentOps infrastructure
            </div>

            <h1 className="mt-7 text-5xl font-semibold tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl lg:leading-[0.98]">
              Build AI agents with confidence, not guesswork.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Agent Workbench brings evaluation, observability, and reliable execution into one focused platform for teams building production AI agents.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950">
                Explore the workbench <Icon name="arrow" className="h-4 w-4" />
              </Link>
              <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.035] px-5 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                <Icon name="github" /> View on GitHub
              </Link>
            </div>
          </div>

          <div className="mt-14 sm:mt-16 lg:mt-20">
            <ProductPreview />
          </div>
        </div>
      </section>

      <section id="product" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">The essentials</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Everything you need to move an agent from experiment to production.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">No wall of features. Just the operational loop that matters once agents become real software.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {capabilities.map(({ icon, eyebrow, title, description }) => (
              <article key={eyebrow} className="group rounded-3xl border border-white/10 bg-white/[0.025] p-6 transition hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-white/[0.04] sm:p-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-300">
                  <Icon name={icon} />
                </div>
                <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">{title}</h3>
                <p className="mt-4 text-base leading-7 text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-white/10 bg-white/[0.018] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">One continuous loop</p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Make every release more measurable than the last.</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-slate-400 lg:justify-self-end">
              Agent Workbench connects the parts teams usually stitch together by hand, so evaluation results, runtime behavior, and operational evidence stay in the same engineering workflow.
            </p>
          </div>

          <div className="mt-12 grid overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map(([number, title, description], index) => (
              <div key={title} className={`p-6 sm:p-7 ${index ? 'border-t border-white/10 md:[&:nth-child(2)]:border-l lg:border-l lg:border-t-0 md:[&:nth-child(3)]:border-t lg:[&:nth-child(3)]:border-t-0 md:[&:nth-child(4)]:border-l' : ''}`}>
                <span className="font-mono text-xs text-cyan-300">{number}</span>
                <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="open-source" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(8,47,73,.75),rgba(15,23,42,.95)_45%,rgba(2,6,23,1))] px-6 py-12 sm:px-10 sm:py-16 lg:px-16">
            <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-3xl">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-cyan-300">
                  <Icon name="github" />
                </div>
                <h2 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Built in public. Designed to be extended.</h2>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                  Inspect the architecture, follow the roadmap, contribute code, or bring a real production use case. Agent Workbench is open infrastructure, not a black box.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                  View repository <Icon name="arrow" className="h-4 w-4" />
                </Link>
                <Link href="/roadmap" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.035] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                  See roadmap
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
