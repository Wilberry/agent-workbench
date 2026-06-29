'use client';

import { useState } from 'react';
import { ContentSection, InfoCard, PublicPage } from '@/components/landing/PageScaffold';
import { githubUrl, Icon, type IconName } from '@/components/landing/data';

const contacts: Array<[string, string, string, IconName]> = [
  ['GitHub', githubUrl, 'Open issues, discuss roadmap ideas, and submit pull requests.', 'github'],
  ['LinkedIn', 'https://www.linkedin.com/in/wilberry', 'Connect for collaboration, hiring, and platform conversations.', 'link'],
  ['WhatsApp', 'https://wa.me/2348107024396', 'Reach out for quick project or contribution questions.', 'phone']
];

export function ContactClient() {
  const [copied, setCopied] = useState(false);
  const email = 'wilsonnkwa@gmail.com';
  return (
    <PublicPage eyebrow="Contact" title="Talk to the Agent Workbench project." description="Use the channel that fits your goal: contribution inquiries, general questions, bug reports, feature requests, or open-source collaboration.">
      <ContentSection title="Contact channels">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(email); setCopied(true); }} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-left transition hover:-translate-y-1 hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            <Icon name="mail" className="h-6 w-6 text-cyan-300" />
            <h2 className="mt-5 font-semibold text-white">Email</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{copied ? 'Copied to clipboard' : email}</p>
          </button>
          {contacts.map(([title, href, description, icon]) => (
            <a key={title} href={href} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950">
              <Icon name={icon} className="h-6 w-6 text-cyan-300" />
              <h2 className="mt-5 font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
            </a>
          ))}
        </div>
      </ContentSection>
      <ContentSection title="What to send">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <InfoCard title="Contribution inquiries">Share the area you want to improve and the production problem you are trying to solve.</InfoCard>
          <InfoCard title="General questions">Ask about roadmap direction, architecture decisions, or whether Agent Workbench fits your workflow.</InfoCard>
          <InfoCard title="Bug reports">Include reproduction steps, logs, screenshots, environment details, and expected behavior.</InfoCard>
          <InfoCard title="Feature requests">Describe the user, workflow, operational value, and how it supports production AI systems.</InfoCard>
        </div>
      </ContentSection>
    </PublicPage>
  );
}
