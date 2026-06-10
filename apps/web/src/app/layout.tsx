import './globals.css';
import Providers from '@/lib/providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Workbench',
  description: 'A scalable monorepo for agent orchestration workflows.'
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
