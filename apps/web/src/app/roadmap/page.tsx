import { ContentSection, PublicPage } from '@/components/landing/PageScaffold';
import { roadmap } from '@/components/landing/data';

export const metadata = {
  title: 'Roadmap | Agent Workbench',
  description: 'Explore implemented, in-progress, planned, and future vision work for Agent Workbench.'
};

const descriptions: Record<string, string> = {
  'Agent CRUD': 'Create and manage agents as durable platform resources.',
  Versioning: 'Track agent and prompt changes so teams can compare and roll back safely.',
  Organizations: 'Support team workspaces and multi-tenant collaboration.',
  Authentication: 'Secure product access with identity-aware workflows.',
  RBAC: 'Control who can administer, operate, and inspect AI systems.',
  'Evaluation Engine': 'Measure quality against repeatable datasets and scoring flows.',
  'Trace Collection': 'Capture execution history for debugging and operational review.',
  'Queue Processing': 'Move background AI work into reliable asynchronous execution.',
  'Retry System': 'Recover from transient failures without losing jobs.',
  'Cost Tracking': 'Attribute usage and spend across agents and organizations.',
  'Prompt Playground': 'Experiment with prompts and model settings in a controlled workspace.',
  'Model Registry': 'Track provider and model options available to teams.',
  'Workflow Builder': 'Compose multi-step agent workflows visually and programmatically.',
  'Live Monitoring Dashboard': 'Observe active agents, queues, costs, and failures in real time.',
  'Enterprise Audit Logs': 'Record sensitive administrative and operational actions for compliance.'
};

function RoadmapGroup({ title, items, emphasis }: { title: string; items: readonly string[]; emphasis?: boolean }) {
  return <div className={`rounded-3xl border p-7 ${emphasis ? 'border-emerald-300/30 bg-emerald-300/[.04]' : 'border-white/10 bg-slate-900/70'}`}><h2 className="text-2xl font-semibold text-white">{title}</h2><div className="mt-6 grid gap-4">{items.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><h3 className="font-semibold text-white">{item}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{descriptions[item] ?? 'A roadmap item that expands Agent Workbench into a more complete production AgentOps platform.'}</p></div>)}</div></div>;
}

export default function RoadmapPage() {
  return (
    <PublicPage eyebrow="Roadmap" title="A transparent roadmap for production AgentOps." description="Agent Workbench prioritizes implemented infrastructure first, then expands toward richer workflows, deployment options, monitoring, marketplace capabilities, and enterprise governance.">
      <ContentSection title="Current roadmap">
        <div className="grid gap-6 lg:grid-cols-3">
          <RoadmapGroup title="Implemented" items={roadmap.Implemented} emphasis />
          <RoadmapGroup title="In Progress" items={roadmap['In Progress']} />
          <RoadmapGroup title="Planned" items={roadmap.Planned} />
        </div>
      </ContentSection>
      <ContentSection title="Future vision">
        <p className="max-w-4xl text-lg leading-8 text-slate-300">The long-term goal is a complete open-source AI operations layer: self-hostable deployments, provider-neutral model operations, evaluation-driven release workflows, live monitoring, agent marketplaces, safety controls, and enterprise-grade auditability.</p>
      </ContentSection>
    </PublicPage>
  );
}
