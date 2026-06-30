import { ContentSection, InfoCard, PublicPage } from '@/components/landing/PageScaffold';

export const metadata = {
  title: 'About | Agent Workbench',
  description: 'Learn why Agent Workbench exists, the problems it solves, its open-source philosophy, and long-term AgentOps vision.'
};

const timeline = ['Prompt Engineering', 'Agent Engineering', 'AgentOps', 'Production AI Platforms'];

export default function AboutPage() {
  return (
    <PublicPage eyebrow="About" title="Agent Workbench exists because AI systems need software engineering discipline." description="The platform is built for the moment when agents leave notebooks and demos, enter products and workflows, and require evaluation, observability, reliability, governance, and cost control.">
      <ContentSection title="Why it exists">
        <div className="grid gap-5 md:grid-cols-2">
          <InfoCard title="The problem">Agent prototypes are easy to create but hard to operate. Teams quickly need version history, repeatable evaluations, traces, queues, retries, cost visibility, and access control.</InfoCard>
          <InfoCard title="The platform vision">Agent Workbench aims to become an open infrastructure layer for building, evaluating, monitoring, and operating AI agents with production-grade workflows.</InfoCard>
        </div>
      </ContentSection>
      <ContentSection id="vision" title="Evolution of AI engineering">
        <div className="grid gap-4 md:grid-cols-4">
          {timeline.map((item, index) => <div key={item} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-center"><p className="font-semibold text-white">{item}</p>{index < timeline.length - 1 ? <p className="mt-4 text-cyan-300 md:hidden">↓</p> : null}</div>)}
        </div>
      </ContentSection>
      <ContentSection title="Design philosophy">
        <div className="grid gap-5 md:grid-cols-3">
          <InfoCard title="Production-first">Prioritize durable patterns such as RLS, workers, retries, evaluations, and observable execution over flashy demos.</InfoCard>
          <InfoCard title="Open and extensible">Keep the code inspectable and the architecture adaptable for teams with different providers, workflows, and governance needs.</InfoCard>
          <InfoCard title="Developer-respectful">Use a TypeScript-first architecture and clear platform primitives that senior engineers can reason about and extend.</InfoCard>
        </div>
      </ContentSection>
    </PublicPage>
  );
}
