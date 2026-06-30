import Link from 'next/link';
import { ContentSection, InfoCard, PublicPage } from '@/components/landing/PageScaffold';
import { githubUrl } from '@/components/landing/data';

export const metadata = {
  title: 'Contributing | Agent Workbench',
  description: 'Learn how to contribute code, issues, feature requests, and documentation to Agent Workbench.'
};

export default function ContributingPage() {
  return (
    <PublicPage eyebrow="Contributing" title="Help build open AgentOps infrastructure." description="Agent Workbench welcomes focused contributions from developers, AI engineers, platform teams, technical writers, and operators with production AI experience.">
      <ContentSection title="How to contribute">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <InfoCard title="Development setup">Clone the repository, install workspace dependencies with pnpm, configure Supabase environment variables, and run the web app locally.</InfoCard>
          <InfoCard title="Code standards">Prefer typed TypeScript, accessible React, reusable components, clear API boundaries, and changes that preserve existing architecture.</InfoCard>
          <InfoCard title="Pull request process">Open focused PRs with a clear motivation, implementation summary, test notes, and screenshots for visible UI changes.</InfoCard>
          <InfoCard title="Issue reporting">Include reproduction steps, expected behavior, actual behavior, logs, screenshots, and environment details when possible.</InfoCard>
          <InfoCard title="Feature requests">Explain the production workflow, the user role, the operational pain, and why the feature belongs in Agent Workbench.</InfoCard>
          <InfoCard title="Community guidelines">Be respectful, specific, and collaborative. The project grows best when contributors bring real-world context and constructive review.</InfoCard>
        </div>
      </ContentSection>
      <ContentSection title="Ready to help?">
        <Link href={githubUrl} className="inline-flex rounded-2xl bg-white px-6 py-4 font-semibold text-slate-950 hover:bg-cyan-100">Visit the GitHub repository</Link>
      </ContentSection>
    </PublicPage>
  );
}
