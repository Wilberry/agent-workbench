'use client';

import Link from 'next/link';
import { useState } from 'react';
import { architectureFlow, audiences, featureCategories, githubUrl, Icon, metrics, productionCapabilities, roadmap, technologyStack, type IconName } from './data';
import { PublicFooter } from './PublicFooter';
import { FadeIn } from './Motion';

type SectionProps = {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
};

function Section({ id, eyebrow, title, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-28 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {eyebrow ? <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">{eyebrow}</p> : null}
        <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h2>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-slate-950/20 ${className}`}>
      {children}
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-36 sm:pt-44">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,.08)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="absolute left-1/2 top-0 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
        <FadeIn>
          <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-200">
            Open-source AgentOps for production AI teams
          </p>
          <h1 className="mt-8 max-w-5xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Build, Evaluate, and Operate AI Agents at Production Scale
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            Agent Workbench is an open-source AgentOps platform that helps developers and organizations build, version, evaluate,
            experiment with, observe, and operate AI agents using production-grade infrastructure.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-semibold text-slate-950 shadow-xl shadow-white/10 hover:bg-cyan-100">
              Get Started <Icon name="arrow" />
            </Link>
            <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-6 py-4 font-semibold text-white hover:bg-white/10">
              <Icon name="github" /> View GitHub
            </Link>
          </div>
        </FadeIn>

        <FadeIn delay={120} className="relative">
          <Panel className="p-3 backdrop-blur">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Agent operations overview</p>
                  <p className="text-xl font-semibold text-white">Production workspace</p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">all systems normal</span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ['Eval pass rate', '94.2%', '↑ 6.1%'],
                  ['Queue depth', '18 jobs', '2 retries'],
                  ['Daily model cost', '$128.40', 'budget ok']
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                    <p className="mt-1 text-xs text-cyan-300">{detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-sm font-semibold text-white">Agents</p>
                  <div className="mt-3 space-y-3">
                    {['Support triage', 'Research analyst', 'Billing assistant'].map((agent, index) => (
                      <div key={agent} className="flex items-center justify-between rounded-xl bg-white/[.04] px-3 py-2 text-sm">
                        <span className="text-slate-300">{agent}</span>
                        <span className={index === 1 ? 'text-cyan-300' : 'text-emerald-300'}>{index === 1 ? 'evaluating' : 'live'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <p className="text-sm font-semibold text-white">Execution timeline</p>
                  <div className="mt-3 space-y-3">
                    {['Tool call completed', 'Trace span recorded', 'Evaluation regression check passed', 'Usage event attributed to Growth org'].map((event, index) => (
                      <div key={event} className="flex gap-3 text-sm text-slate-300">
                        <span className="mt-2 h-2 w-2 rounded-full bg-cyan-300" />
                        <span>{event}</span>
                        <span className="ml-auto text-slate-500">{index + 1}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </FadeIn>
      </div>
    </section>
  );
}

export function Metrics() {
  return (
    <section className="border-y border-white/10 bg-white/[.02] py-10">
      <div className="mx-auto grid max-w-7xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-7 lg:px-8">
        {metrics.map(([value, label], index) => (
          <FadeIn delay={index * 35} key={value} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-sm text-slate-400">{label}</p>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

export function Problem() {
  return (
    <Section id="why" eyebrow="Why it exists" title="Building AI agents is easy. Operating them in production is the hard part.">
      <div className="grid gap-8 lg:grid-cols-2">
        <p className="text-xl leading-9 text-slate-300">
          Teams can prototype agents quickly, but production systems need versioning, testing, evaluation, observability, cost
          tracking, experimentation, reliability, queue processing, and governance. Without that foundation, AI projects become
          opaque, expensive, and difficult to maintain.
        </p>
        <Panel className="p-8">
          <p className="text-lg leading-8 text-slate-300">
            Agent Workbench provides the operational layer: reusable agent records, prompt and version control, evaluation datasets,
            trace collection, usage analytics, background workers, recovery paths, and organization controls designed for real teams.
          </p>
        </Panel>
      </div>
    </Section>
  );
}

export function Audience() {
  return (
    <Section id="who-it-helps" eyebrow="Who it helps" title="Designed for every role involved in production AI.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {audiences.map(([title, description, icon], index) => (
          <FadeIn delay={index * 50} key={title} className="group rounded-3xl border border-white/10 bg-slate-900/60 p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-slate-900">
            <Icon name={icon as IconName} className="h-6 w-6 text-cyan-300" />
            <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

export function Features() {
  return (
    <Section id="features" eyebrow="Core features" title="Production AgentOps primitives, explained in engineering terms.">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {featureCategories.map(({ title, icon, description, items }, index) => (
          <FadeIn delay={index * 45} key={title} className="rounded-3xl border border-white/10 bg-slate-900/70 p-7 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-2xl hover:shadow-cyan-950/20">
            <Icon name={icon as IconName} className="h-7 w-7 text-cyan-300" />
            <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
            <ul className="mt-6 space-y-4">
              {items.map(([item, value]) => (
                <li key={item} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                  <p className="text-sm font-semibold text-white">{item}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{value}</p>
                </li>
              ))}
            </ul>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

export function Production() {
  return (
    <Section id="production" eyebrow="Built for production" title="The operational safeguards that separate platforms from prototypes.">
      <Panel className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 sm:p-10">
        <div className="max-w-3xl">
          <p className="text-lg leading-8 text-slate-300">
            Agent Workbench is designed around the infrastructure teams need after the first demo works: tenant boundaries, secure data access,
            background execution, measurable quality, traceable failures, and cost visibility.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {productionCapabilities.map(([capability, value]) => (
            <div key={capability} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
              <div className="flex items-center gap-3">
                <Icon name="shield" className="h-5 w-5 text-emerald-300" />
                <h3 className="font-semibold text-white">{capability}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  );
}

export function Architecture() {
  return (
    <Section id="architecture" eyebrow="Architecture" title="A responsive operating diagram for production AI systems.">
      <div className="grid gap-4 lg:grid-cols-9">
        {architectureFlow.map(([title, description, icon], index) => (
          <div key={title} className="relative lg:col-span-1">
            <FadeIn delay={index * 35} className="h-full rounded-3xl border border-white/10 bg-slate-900/70 p-5 transition hover:border-cyan-300/40">
              <div className="flex h-full flex-col">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300 ring-1 ring-cyan-300/20">
                  <Icon name={icon as IconName} />
                </span>
                <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            </FadeIn>
            {index < architectureFlow.length - 1 ? (
              <div className="mx-auto h-4 w-px bg-cyan-300/30 lg:absolute lg:-right-4 lg:top-1/2 lg:h-px lg:w-4" aria-hidden="true" />
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function TechnologyStack() {
  return (
    <Section id="technology" eyebrow="Technology stack" title="Built on infrastructure developers already trust.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {technologyStack.map(([name, description], index) => (
          <FadeIn delay={index * 35} key={name} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-2xl hover:shadow-cyan-950/20 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-950">
              {name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
            </div>
            <h3 className="mt-5 text-lg font-semibold text-white">{name}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

export function Matters() {
  return (
    <Section id="matters" eyebrow="Why this matters" title="AI engineering is moving from prompts to operated systems.">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel className="p-8 text-center text-xl font-semibold text-white">
          Prompt Engineering<br /><span className="text-cyan-300">↓</span><br />Agent Engineering<br /><span className="text-cyan-300">↓</span><br />AgentOps<br /><span className="text-cyan-300">↓</span><br />Production AI Systems
        </Panel>
        <p className="text-xl leading-9 text-slate-300">
          As agents become part of customer-facing products and internal business workflows, teams need the same operational discipline
          they expect from cloud services: repeatable releases, measurable quality, traceable execution, reliable queues, and governance.
          Agent Workbench supplies that missing infrastructure layer.
        </p>
      </div>
    </Section>
  );
}

export function Roadmap() {
  const roadmapSummary = {
    Implemented: roadmap.Implemented.slice(0, 12),
    'In Progress': roadmap['In Progress'],
    Planned: roadmap.Planned.slice(0, 7)
  } as const;

  const indicators = {
    Implemented: 'bg-emerald-300 text-emerald-950',
    'In Progress': 'bg-cyan-300 text-cyan-950',
    Planned: 'bg-slate-700 text-slate-100'
  } as const;

  return (
    <Section id="roadmap" eyebrow="Feature roadmap" title="A pragmatic roadmap with implemented infrastructure first.">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.925fr_0.925fr]">
        {Object.entries(roadmapSummary).map(([status, items]) => (
          <Panel key={status} className={`p-7 ${status === 'Implemented' ? 'border-emerald-300/30 bg-emerald-300/[.04]' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-white">{status}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${indicators[status as keyof typeof indicators]}`}>{items.length} items</span>
            </div>
            <ul className="mt-6 grid gap-3">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-3 rounded-2xl bg-white/[.04] px-4 py-3 text-sm text-slate-200">
                  <span className={`h-2.5 w-2.5 rounded-full ${status === 'Implemented' ? 'bg-emerald-300' : status === 'In Progress' ? 'bg-cyan-300' : 'bg-slate-500'}`} />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

export function OpenSource() {
  return (
    <Section id="open-source" eyebrow="Open source" title="Built in the open for transparent, extensible AI infrastructure.">
      <Panel className="grid gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
        <div>
          <p className="text-xl leading-9 text-slate-300">
            Agent Workbench is open source because production AI infrastructure should be inspectable, extensible, and shaped by the
            engineers operating it. Teams can audit the architecture, adapt modules to their stack, and contribute improvements that help
            the ecosystem mature beyond one-off demos.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {['Transparency for critical AI workflows', 'Community review of reliability patterns', 'Extensible primitives for new providers', 'Long-term ecosystem growth'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-slate-200">{item}</div>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-semibold text-slate-950 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            <Icon name="github" /> Contribute on GitHub
          </Link>
          <Link href={`${githubUrl}/issues`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-6 py-4 font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            Start a discussion <Icon name="arrow" />
          </Link>
        </div>
      </Panel>
    </Section>
  );
}

export function WhyOpenSource() {
  return (
    <Section id="why-open-source" eyebrow="Why open source?" title="AI infrastructure improves when operators can inspect and extend it.">
      <div className="grid gap-5 md:grid-cols-3">
        {[
          ['Trust', 'Agent execution, evaluation, and cost data are operationally sensitive. Open code makes architecture and security assumptions easier to review.'],
          ['Extensibility', 'Every team has different providers, tools, workflows, and governance requirements. Open primitives make adaptation practical.'],
          ['Collaboration', 'Reliability patterns improve when maintainers, contributors, startups, and enterprises share real production feedback.']
        ].map(([title, description]) => (
          <Panel key={title} className="p-7">
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="mt-4 text-sm leading-6 text-slate-400">{description}</p>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

export function Principles() {
  const principles = ['Production-first', 'Developer Experience', 'Scalable Architecture', 'Open Standards', 'Reliable Infrastructure', 'Security by Design', 'Evaluation Driven Development', 'Modern AI Engineering'];

  return (
    <Section id="principles" eyebrow="Designed for real AI teams" title="Engineering principles instead of synthetic testimonials.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {principles.map((principle) => (
          <div key={principle} className="rounded-2xl border border-white/10 bg-white/[.04] p-5 font-medium text-white">
            {principle}
          </div>
        ))}
      </div>
    </Section>
  );
}


export function ScreenshotFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-slate-950/30">
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950 p-5">
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
          <p className="font-semibold text-white">{title}</p>
          <div className="flex gap-1.5" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" /></div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function GitHubCTA() {
  return (
    <Section id="community" eyebrow="Community" title="Help build the AgentOps layer production teams need.">
      <Panel className="grid gap-8 p-8 lg:grid-cols-[1fr_0.8fr] lg:p-10">
        <div>
          <p className="text-xl leading-9 text-slate-300">
            Star the repository, report issues, submit pull requests, or propose features. Community contributions matter because reliable AI infrastructure is too important to be shaped only by closed demos and isolated internal tools.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {['Star the repository', 'Report bugs with context', 'Submit focused pull requests', 'Propose production use cases'].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-slate-200">{item}</div>)}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <Link href={githubUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-semibold text-slate-950 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"><Icon name="github" /> View repository</Link>
          <Link href={`${githubUrl}/pulls`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-6 py-4 font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">Open pull requests <Icon name="arrow" /></Link>
        </div>
      </Panel>
    </Section>
  );
}

export function FAQ() {
  const faqs = [
    ['What is Agent Workbench?', 'An open-source AgentOps platform for building, evaluating, observing, and operating AI agents with production-grade infrastructure.'],
    ['Who is it for?', 'AI developers, platform engineers, startups, researchers, and enterprises that need more than a chatbot demo.'],
    ['Is it open source?', 'Yes. Agent Workbench is designed as transparent, extensible infrastructure for the AI engineering community.'],
    ['Can I self-host it?', 'The architecture is built around open components such as Next.js, TypeScript, Supabase, and PostgreSQL, making self-hosting a core direction for the platform.'],
    ['What AI providers are supported?', 'The platform is provider-oriented and designed for integrations with OpenAI, Anthropic, and additional model providers over time.'],
    ['How is it different from simple AI demos?', 'It focuses on operational primitives: versioning, evaluation, tracing, queues, retries, cost analytics, organizations, and RBAC.'],
    ['Is it production ready?', 'The codebase is being shaped around production patterns such as RLS, background workers, retry recovery, and evaluation-driven releases.'],
    ['Can enterprises use it?', 'The platform direction includes multi-tenancy, governance, auditability, secure authentication, and collaboration for larger teams.']
  ];
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions engineers ask before adopting AgentOps infrastructure.">
      <div className="grid gap-4 lg:grid-cols-2">
        {faqs.map(([question, answer]) => (
          <details key={question} className="group rounded-3xl border border-white/10 bg-slate-900/70 p-6 open:border-cyan-300/30">
            <summary className="cursor-pointer list-none font-semibold text-white focus:outline-none group-open:text-cyan-200">{question}</summary>
            <p className="mt-4 text-sm leading-6 text-slate-400">{answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function BuildVsBuy() {
  const items = ['Agent versioning', 'Evaluation pipelines', 'Experiment tracking', 'Queue management', 'Observability', 'Cost analytics', 'Organization management', 'RBAC', 'Background workers', 'Retry handling'];
  return (
    <Section id="why-not-build" eyebrow="Why not build it yourself?" title="AgentOps looks simple until every production concern becomes your platform team's backlog.">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <p className="text-xl leading-9 text-slate-300">Most teams can wire an agent to a model provider. The hard part is maintaining the operational system around it: quality gates, queues, traces, retries, cost reporting, access control, and experiment history. Agent Workbench gives teams a shared foundation so they can focus on product behavior instead of rebuilding platform plumbing.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-slate-200">{item}</div>)}
        </div>
      </div>
    </Section>
  );
}

export function UseCases() {
  const cases = [
    ['Customer Support Agents', 'Version support workflows, evaluate answer quality, monitor costs, and inspect traces for escalations.'],
    ['Internal Knowledge Assistants', 'Test retrieval behavior, compare prompts, and control access across teams and organizations.'],
    ['Research Agents', 'Benchmark experiments, preserve run history, and compare model/provider performance.'],
    ['Code Generation', 'Track execution attempts, evaluate generated outputs, and recover failed background jobs.'],
    ['Document Processing', 'Queue long-running extraction workflows with retries, observability, and cost attribution.'],
    ['Workflow Automation', 'Operate tool-using agents with execution timelines, failure handling, and usage analytics.'],
    ['Enterprise AI Platforms', 'Provide shared governance, RBAC, multi-tenancy, and operational visibility for AI initiatives.']
  ];
  return (
    <Section id="use-cases" eyebrow="Use cases" title="Practical workflows for teams operating AI agents.">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {cases.map(([title, description]) => <Panel key={title} className="p-6"><h3 className="text-lg font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{description}</p></Panel>)}
      </div>
    </Section>
  );
}

export function Vision() {
  return (
    <Section id="vision" eyebrow="Vision" title="The operating layer for the next generation of software.">
      <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[.06] p-8 sm:p-12">
        <p className="max-w-5xl text-2xl leading-10 text-slate-100">
          Software engineering matured from editors into Git, CI/CD, observability, cloud platforms, and operational playbooks. AI
          engineering is undergoing the same transformation. Agent Workbench aims to become the infrastructure layer that enables teams
          to confidently build, evaluate, monitor, and operate AI systems — with the transparency of open source and the discipline of
          production software.
        </p>
      </div>
    </Section>
  );
}

export function Contact() {
  const [copied, setCopied] = useState(false);
  const email = 'wilsonnkwa@gmail.com';
  const cards: Array<[string, string, IconName]> = [
    ['GitHub', githubUrl, 'github'],
    ['LinkedIn', 'https://www.linkedin.com/in/wilberry', 'link'],
    ['WhatsApp', 'https://wa.me/2348107024396', 'phone']
  ];

  return (
    <Section id="contact" eyebrow="Contact" title="Interested in contributing or evaluating Agent Workbench?">
      <div className="mb-8 max-w-3xl rounded-3xl border border-white/10 bg-white/[.04] p-6 text-slate-300">
        We welcome contributors, discussions, bug reports, feature requests, and community collaboration from developers and teams building production AI systems.
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(email);
            setCopied(true);
          }}
          className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-left transition hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-2xl hover:shadow-cyan-950/20 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          <Icon name="mail" className="h-6 w-6 text-cyan-300" />
          <h3 className="mt-5 font-semibold text-white">Email</h3>
          <p className="mt-2 text-sm text-slate-400">{copied ? 'Copied to clipboard' : email}</p>
        </button>
        {cards.map(([title, url, icon]) => (
          <a key={title} href={url} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-2xl hover:shadow-cyan-950/20 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            <Icon name={icon} className="h-6 w-6 text-cyan-300" />
            <h3 className="mt-5 font-semibold text-white">{title}</h3>
            <p className="mt-2 break-all text-sm text-slate-400">{url}</p>
          </a>
        ))}
      </div>
    </Section>
  );
}

export function Footer() {
  return <PublicFooter />;
}
