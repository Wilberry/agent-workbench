import './globals.css';
import Providers from '@/lib/providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://agent-workbench.dev'),
  title: 'Agent Workbench | Open-source AgentOps for production AI systems',
  description: 'Build, version, evaluate, observe, and operate AI agents with production-grade open-source AgentOps infrastructure.',
  keywords: ['AgentOps', 'LLMOps', 'AI agents', 'agent evaluation', 'AI observability', 'AI infrastructure', 'Supabase', 'Next.js'],
  alternates: {
    canonical: '/'
  },
  openGraph: {
    title: 'Agent Workbench',
    description: 'Open-source AgentOps infrastructure for building and operating AI agents at production scale.',
    type: 'website',
    url: '/',
    siteName: 'Agent Workbench'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent Workbench',
    description: 'Open-source AgentOps infrastructure for production AI systems.'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
