import Image from 'next/image';
import Link from 'next/link';
import { Architecture, Contact, Features, Footer, Problem, Production, UseCases, Vision } from '@/components/landing/Sections';
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

const buildEvidence = [
  ['Public API contract', 'A versioned v1 contract and compatibility policy make the external surface explicit.'],
  ['Release evidence gate', 'CI aggregates validation evidence so releases depend on demonstrated checks.'],
  ['Production worker runtime', 'Background execution has an explicit production worker path with recovery semantics.'],
  ['Queue health observability', 'Operational checks expose queue health, retries, stale work, and failure states.']
] as const;

const collaborationPaths = [
  {
    title: 'Design partners',
    description: 'Teams operating real agents can help shape workflows, reliability requirements, and the production experience.',
    href: '/contact',
    action: 'Talk about your use case'
  },
  {
    title: 'Open-source contributors',
    description: 'Engineers can improve runtime, evaluation, observability, SDK, documentation, and product surfaces in public.',
    href: '/contributing',
    action: 'See how to contribute'
  },
  {
    title: 'Infrastructure collaborators',
    description: 'Provider, database, tooling, and AI infrastructure teams can explore integrations and shared technical work.',
    href: `${githubUrl}/issues`,
    action: 'Start on GitHub'
  }
] as const;

function ProductPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-3xl lg:max-w-none">
      <div
        aria-hidden="true"
        className="absolute -inset-x-10 -inset-y-8 -z-10 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_68%)] blur-2xl"
      />

      <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-900/70 p-1.5 shadow-2xl shadow-black/40 ring-1 ring-white/5">
        <div className="overflow-hidden rounded-[1.25rem] border border-white/[.08] bg-slate-950">
          <Image
            src="/images/agent-workbench-dashboard.webp"
            alt="Agent Workbench dashboard showing sample agents, evaluations, traces, queue health, cost analytics, and latency in Demo Workspace"
            width={1586}
            height={992}
            priority
            quality={90}
            sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 3rem), 55vw"
            className="h-auto w-full"
          />
        </div>
      </div>

      <figcaption className="mt-3 text-center text-xs leading-5 text-slate-500">
        Representative product view · Sample data
      </figcaption>
    </figure>
  );
}

function LandingHero() {
  return (
    <>
      <section id="top" className="relative isolate overflow-hidden pt-32 sm:pt-40">
        <div className="absolute inset-0 -z-20 bg-slate-950" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_52%)]" />
        <div className="absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14 lg:px-8 lg:pb-28 xl:gap-16">
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

function BuiltInPublic() {
  return (
    <section id="collaborate" className="border-y border-white/10 bg-white/[.018] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Built in public</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Evidence over promises.</h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-slate-400 lg:justify-self-end">
            Public contracts, release gates, runbooks, and production infrastructure make the engineering direction inspectable. The roadmap is visible, and collaboration can start from concrete work rather than a pitch deck.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {buildEvidence.map(([title, description], index) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[.07] font-mono text-xs text-cyan-300">0{index + 1}</span>
                <div>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Collaborate</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Three useful ways to work with Agent Workbench now.</h3>
          </div>
          <Link href="/roadmap" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200">
            Explore the public roadmap <Icon name="arrow" />
          </Link>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {collaborationPaths.map(({ title, description, href, action }) => (
            <Link key={title} href={href} className="group rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-slate-900">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 group-hover:text-cyan-200">
                {action} <Icon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
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
      <BuiltInPublic />
      <Vision />
      <Contact />
      <Footer />
    </main>
  );
}
