import { Architecture, Audience, BuildVsBuy, Contact, FAQ, Features, Footer, GitHubCTA, Hero, Matters, Metrics, OpenSource, Principles, Problem, Production, Roadmap, TechnologyStack, UseCases, Vision, WhyOpenSource } from '@/components/landing/Sections';
import { Navbar } from '@/components/landing/Navbar';

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Agent Workbench',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: 'Open-source AgentOps infrastructure for building, evaluating, observing, and operating AI agents in production.',
    license: 'https://opensource.org/license/mit',
    codeRepository: 'https://github.com/wilberry/agent-workbench'
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Agent Workbench',
    url: 'https://agent-workbench.dev',
    sameAs: ['https://github.com/wilberry/agent-workbench']
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://agent-workbench.dev' }]
  }
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <Hero />
      <Metrics />
      <Problem />
      <Audience />
      <Features />
      <UseCases />
      <BuildVsBuy />
      <Production />
      <Architecture />
      <TechnologyStack />
      <Matters />
      <Roadmap />
      <OpenSource />
      <WhyOpenSource />
      <GitHubCTA />
      <FAQ />
      <Principles />
      <Vision />
      <Contact />
      <Footer />
    </main>
  );
}
