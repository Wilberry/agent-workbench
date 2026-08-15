import Link from 'next/link';
import { Architecture, Contact, Features, Footer, GitHubCTA, Problem, Production, UseCases, Vision, WhyOpenSource } from '@/components/landing/Sections';
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

const proofPoints = [
  ['Evaluation-first', 'Ship agent changes against repeatable quality gates'],
  ['Observable', 'Trace executions, failures, latency, tokens, and cost'],
  ['Reliable by design', 'Queues, retries, recovery, and dead-letter handling'],
  ['Open infrastructure', 'MIT licensed and built on PostgreSQL + Supabase']
] as const;

const workflow = [
  ['01', 'Version', 'Prompts, models, tools, and agent configuration'],
  ['02', 'Evaluate', 'Run datasets and compare quality before release'],
  ['03', 'Operate', 'Execute through durable production workflows'],
  ['04', 'Observe', 'Inspect traces, failures, latency, and spend']
] as const;

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
      <div className="absolute -inset-8 -z-10 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-xl">
        <div className="rounded-[1.55rem] border border-white/10 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              production healthy
            </span>
          </div>

          <div className="grid gap-px bg-white/10 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="bg-slate-950 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agents</p>
              <div className="mt-4 space-y-2">
                {['Support triage', 'Research analyst', 'Billing assistant'].map((agent, index) => (
                  <div key={agent} className={`rounded-xl border px-3 py-3 ${index === 0 ? 'border-cyan-300/30 bg-cyan-300/[.06]' : 'border-white/5 bg-white/[.025]'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-200">{agent}</span>
                      <span className={`h-2 w-2 rounded-full ${index === 1 ? 'bg-amber-300' : 'bg-emerald-400'}`} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">v{index + 3}.2 · gpt-5</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evaluation run</p>
                  <p className="mt-1 text-lg font-semibold text-white">support-regression-042</p>
                </div>
                <span className="text-sm font-medium text-emerald-300">94.2% pass</span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  ['Quality', '94.2%'],
                  ['P95 latency', '1.8s'],
                  ['Cost / run', '$0.041']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                    <p className="text-[11px] text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
                <div className="border-b border-white/10 bg-white/[.025] px-4 py-2 text-xs font-medium text-slate-400">Execution trace</div>
                <div className="space-y-0 divide-y divide-white/5">
                  {[
                    ['Model response', '428ms', 'complete'],
                    ['search_customer', '186ms', 'complete'],
                    ['policy_check', '92ms', 'complete'],
                    ['Evaluation scorer', '311ms', 'passed']
                  ].map(([label, latency, status]) => (
                    <div key={label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-xs">
                      <span className="text-slate-300">{label}</span>
                      <span className="text-slate-500">{latency}</span>
                      <span className="text-emerald-300">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingHero() {
  return (
    <>
      <section id="top" className="relative isolate overflow-hidden pt-32 sm:pt-40">
        <div className="absolute inset-0 -z-20 bg-slate-950" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_52%)]" />
        <div className="absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />

        <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 pb-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:pb-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3.5 py-2 text-sm font-medium text-cyan-100">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)]" />
              Open-source infrastructure for production AI agents
            </div>

            <h1 className="mt-7 max-w-4xl text-5xl font-semibold tracking-[-0.055em] text-white sm:text-6xl lg:text-[4.65rem] lg:leading-[0.98]">
              Ship AI agents you can actually trust in production.
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Agent Workbench gives engineering teams one operating layer to version agents, run evaluations, inspect traces, recover failed jobs, and understand model cost before AI systems become infrastructure debt.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950">
                Explore the workbench <Icon name="arrow" />
              </Link>
              <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[.035] px-5 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[.07] focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
                <Icon name="github" /> View source
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span>MIT licensed</span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-700 sm:block" />
              <span>TypeScript end to end</span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-700 sm:block" />
              <span>PostgreSQL + Supabase</span>
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[.018]">
        <div className="mx-auto grid max-w-7xl divide-y divide-white/10 px-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-6 lg:grid-cols-4 lg:px-8">
          {proofPoints.map(([title, description]) => (
            <div key={title} className="py-7 sm:px-6 first:pl-0 last:pr-0">
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">One production loop</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">From agent change to operational evidence.</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-slate-400 lg:justify-self-end">
              The product is built around the workflow serious AI teams repeat every day, not a collection of disconnected demos.
            </p>
          </div>

          <div className="mt-10 grid overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 md:grid-cols-4">
            {workflow.map(([number, title, description], index) => (
              <div key={title} className={`relative p-6 ${index ? 'border-t border-white/10 md:border-l md:border-t-0' : ''}`}>
                <span className="font-mono text-xs text-cyan-300">{number}</span>
                <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <LandingHero />
      <Problem />
      <Features />
      <Production />
      <UseCases />
      <Architecture />
      <WhyOpenSource />
      <Vision />
      <GitHubCTA />
      <Contact />
      <Footer />
    </main>
  );
}
