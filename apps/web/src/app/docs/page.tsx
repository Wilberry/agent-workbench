import { ContentSection, InfoCard, PublicPage } from '@/components/landing/PageScaffold';

const sections = [
  ['Introduction', 'Understand what Agent Workbench is, where it fits in an AI engineering stack, and how the platform helps teams operate agents beyond prototypes.'],
  ['Getting Started', 'A guided path for creating an account, setting up an organization, defining agents, and running the first evaluation workflow.'],
  ['Installation', 'Self-hosting and local development instructions will cover environment variables, Supabase setup, database migrations, and worker processes.'],
  ['Architecture Overview', 'A practical explanation of the Next.js app, API routes, Supabase/PostgreSQL layer, queues, providers, traces, evaluations, and analytics.'],
  ['Core Concepts', 'Definitions for agents, versions, runs, traces, datasets, evaluations, experiments, organizations, roles, and usage events.'],
  ['Features', 'Deep dives into versioning, evaluation datasets, execution tracing, queue reliability, cost analytics, RBAC, and marketplace foundations.'],
  ['API Overview', 'Reference material for REST endpoints, authentication patterns, request/response examples, and integration workflows.'],
  ['Deployment', 'Production deployment guidance for web, database, workers, environment isolation, monitoring, and backup strategy.'],
  ['Contributing', 'How to propose documentation improvements, file issues, submit pull requests, and help build the platform roadmap.']
] as const;

export const metadata = {
  title: 'Documentation | Agent Workbench',
  description: 'Start learning Agent Workbench concepts, architecture, setup, APIs, deployment, and contribution paths.'
};

export default function DocsPage() {
  return (
    <PublicPage eyebrow="Documentation" title="Start building with Agent Workbench." description="A documentation home for developers and teams evaluating Agent Workbench. Full guides are being developed in the open; each area below explains what is available now and what will be expanded next.">
      <ContentSection title="Documentation roadmap">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sections.map(([title, description]) => <InfoCard key={title} title={title} href={title === 'Contributing' ? '/contributing' : undefined}>{description}<br /><span className="mt-3 inline-block text-cyan-300">Detailed guide in progress.</span></InfoCard>)}
        </div>
      </ContentSection>
    </PublicPage>
  );
}
