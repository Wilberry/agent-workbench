import type { ReactNode } from 'react';

export const githubUrl = 'https://github.com/wilberry/agent-workbench';

export type IconName =
  | 'activity'
  | 'arrow'
  | 'code'
  | 'database'
  | 'github'
  | 'graph'
  | 'layers'
  | 'link'
  | 'lock'
  | 'mail'
  | 'phone'
  | 'queue'
  | 'shield'
  | 'spark'
  | 'test'
  | 'users';

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true
  };

  const paths: Record<IconName, ReactNode> = {
    activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    github: <><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65" /><path d="M9 18c-4.51 2-5-2-7-2" /></>,
    graph: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-7" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.29-1.29a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.61.63A2 2 0 0 1 22 16.92Z" />,
    queue: <><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h7" /><path d="m17 15 3 3-3 3" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
    spark: <><path d="m12 3 1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z" /><path d="M19 15v4" /><path d="M21 17h-4" /></>,
    test: <><path d="M10 2v7.3L4.3 19A2 2 0 0 0 6 22h12a2 2 0 0 0 1.7-3L14 9.3V2" /><path d="M8 2h8" /><path d="M7 16h10" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export const metrics = [
  ['20+', 'Core Platform Modules'],
  ['Production-Ready', 'Architecture'],
  ['End-to-End', 'TypeScript'],
  ['Open Source', 'MIT Licensed'],
  ['Multi-Tenant', 'Organizations & RBAC'],
  ['PostgreSQL', 'Powered by Supabase'],
  ['Production Queues', 'Reliable Execution']
] as const;

export const audiences = [
  ['AI Developers', 'Build agents faster, version prompts safely, compare models, and reuse workflows without rebuilding orchestration glue.', 'code'],
  ['AI Engineers', 'Run evaluation pipelines, queue processing, observability, cost monitoring, and reliability workflows from one platform.', 'activity'],
  ['Startups', 'Ship AI products faster, scale confidently, and reduce operational complexity before infrastructure debt slows the team down.', 'graph'],
  ['Enterprises', 'Support multi-tenancy, RBAC, governance, auditability, and collaboration across serious AI engineering programs.', 'shield'],
  ['Researchers', 'Benchmark experiments, evaluate models, compare prompts, and track performance with reproducible data.', 'test']
] as const;

export const featureGroups = [
  ['Agent Development', 'code', ['Agent Management', 'Agent Versioning', 'Prompt Management', 'Execution Engine', 'Tool Integration']],
  ['Evaluation', 'test', ['Evaluation Datasets', 'Evaluation Runs', 'Automatic Scoring', 'Benchmarking', 'Experiment Comparison']],
  ['Observability', 'activity', ['Trace Collection', 'Execution History', 'Performance Metrics', 'Error Tracking', 'Cost Analytics']],
  ['Reliability', 'queue', ['Queue Workers', 'Retry Logic', 'Dead Letter Queue', 'Worker Recovery', 'Background Jobs']],
  ['Organization', 'users', ['Organizations', 'Teams', 'RBAC', 'Multi-Tenancy', 'Authentication']],
  ['Infrastructure', 'database', ['REST APIs', 'PostgreSQL', 'Supabase', 'TypeScript', 'Modular Architecture']]
] as const;

export const roadmap = {
  Implemented: ['Agent CRUD', 'Versioning', 'Organizations', 'Authentication', 'RBAC', 'Evaluation Engine', 'Evaluation Runs', 'Evaluation Datasets', 'Experiment Framework', 'Trace Collection', 'Queue Processing', 'Retry System', 'Dead Letter Queue', 'Worker Recovery', 'Usage Tracking', 'Cost Tracking', 'Billing Foundations', 'REST APIs', 'Supabase RLS', 'Execution Engine'],
  'In Progress': ['Prompt Playground', 'Model Registry', 'Workflow Builder', 'SDK Improvements', 'MCP Improvements', 'UI Enhancements'],
  Planned: ['Live Monitoring Dashboard', 'Agent Marketplace', 'One-click Deployment', 'Human Feedback Loops', 'Safety Guardrails', 'Fine-tuning Support', 'Kubernetes Deployment', 'Multi-region Execution', 'Visual Workflow Editor', 'Enterprise Audit Logs']
} as const;


export const featureCategories = [
  {
    title: 'Agent Development',
    icon: 'code',
    description: 'Give developers a durable workspace for agent definitions, prompt versions, execution settings, and tools so changes can be reviewed and shipped safely.',
    items: [
      ['Agent Management', 'Track production agents as first-class resources instead of scattered scripts and prompt files.'],
      ['Agent Versioning', 'Release prompt and configuration changes with history, rollback paths, and safer collaboration.'],
      ['Execution Engine', 'Run agents through a consistent runtime so behavior is easier to debug, measure, and improve.']
    ]
  },
  {
    title: 'Evaluation',
    icon: 'test',
    description: 'Make quality measurable by continuously testing agents against datasets before and after deployment.',
    items: [
      ['Evaluation Runs', 'Benchmark agents against datasets to detect regressions and validate improvements before rollout.'],
      ['Automatic Scoring', 'Capture repeatable quality signals that help teams compare prompts, models, and versions.'],
      ['Experiment Comparison', 'Understand which changes improve reliability, cost, latency, and answer quality.']
    ]
  },
  {
    title: 'Observability',
    icon: 'activity',
    description: 'Expose what happened during each execution so engineers can diagnose failures instead of guessing from model outputs.',
    items: [
      ['Trace Collection', 'Inspect execution steps, tool calls, model requests, and errors from a single operational timeline.'],
      ['Performance Metrics', 'Monitor latency, throughput, and failure modes before they become customer-impacting incidents.'],
      ['Cost Analytics', 'Track usage and spend across agents, providers, teams, and experiments.']
    ]
  },
  {
    title: 'Reliability',
    icon: 'queue',
    description: 'Move long-running and failure-prone AI work into production queues with recovery patterns built in.',
    items: [
      ['Queue Workers', 'Process background jobs without blocking product flows or losing work during spikes.'],
      ['Retry Logic', 'Recover from transient provider, network, and tool failures using controlled retry policies.'],
      ['Dead Letter Queue', 'Isolate failed jobs for inspection so teams can fix root causes and replay safely.']
    ]
  },
  {
    title: 'Organization',
    icon: 'users',
    description: 'Support real teams with account boundaries, collaboration controls, and governance primitives from the start.',
    items: [
      ['Multi-Tenancy', 'Separate organizations and workspaces cleanly for startups, agencies, and enterprise deployments.'],
      ['RBAC', 'Control who can manage agents, run evaluations, inspect traces, and administer settings.'],
      ['Authentication', 'Build on secure identity flows instead of one-off internal access controls.']
    ]
  },
  {
    title: 'Infrastructure',
    icon: 'database',
    description: 'Use a modern TypeScript and PostgreSQL foundation that can be extended, audited, and operated by engineering teams.',
    items: [
      ['REST APIs', 'Integrate Agent Workbench into existing products, scripts, and internal platforms.'],
      ['PostgreSQL + Supabase', 'Persist operational data in a proven database layer with Supabase developer velocity.'],
      ['Modular Architecture', 'Extend the platform without turning the codebase into a monolithic AI demo.']
    ]
  }
] as const;

export const productionCapabilities = [
  ['Multi-tenant architecture', 'Keep organizations, users, agents, traces, and evaluations isolated for real customer and team boundaries.'],
  ['Supabase Row-Level Security', 'Enforce data access in the database layer so authorization does not depend only on UI conventions.'],
  ['Queue workers', 'Run slow or bursty AI jobs asynchronously without blocking product requests.'],
  ['Retry recovery', 'Handle transient model-provider, network, and tool failures with controlled recovery paths.'],
  ['Dead-letter queues', 'Capture failed jobs for inspection, repair, and replay instead of silently dropping work.'],
  ['Evaluation engine', 'Measure quality continuously so teams can ship prompt, model, and tool changes with confidence.'],
  ['Experimentation framework', 'Compare variants across quality, cost, and latency before standardizing a release.'],
  ['Execution tracing', 'Debug agent behavior through timelines that expose model calls, tool calls, and errors.'],
  ['Usage and cost analytics', 'Understand which agents, teams, models, and workflows are driving spend.'],
  ['REST APIs', 'Connect the platform to product surfaces, internal tools, automation, and CI workflows.'],
  ['End-to-end TypeScript', 'Share types across UI and platform code to reduce integration defects.'],
  ['Modular architecture', 'Keep AgentOps capabilities composable as the platform grows.']
] as const;

export const architectureFlow = [
  ['Frontend', 'Next.js app for agent, evaluation, trace, and organization workflows', 'code'],
  ['API Layer', 'Typed REST routes and execution endpoints for product and automation access', 'link'],
  ['Supabase', 'Authentication, project services, and policy-aware data access', 'shield'],
  ['Database', 'PostgreSQL stores agents, versions, runs, traces, datasets, and usage', 'database'],
  ['Queue Workers', 'Background execution, retries, recovery, and dead-letter handling', 'queue'],
  ['AI Providers', 'OpenAI, Anthropic, and model-provider integrations through extensible interfaces', 'spark'],
  ['Observability', 'Trace history, performance signals, errors, and operational timelines', 'activity'],
  ['Evaluation', 'Datasets, run results, scoring, benchmark comparison, and regression checks', 'test'],
  ['Analytics', 'Cost, usage, quality, and experimentation insights for teams', 'graph']
] as const;

export const technologyStack = [
  ['Next.js', 'App Router foundation for a fast, modern product surface.'],
  ['React', 'Composable interfaces for agent operations workflows.'],
  ['TypeScript', 'Typed platform code across frontend and backend boundaries.'],
  ['Tailwind CSS', 'Responsive design system primitives without heavy UI runtime.'],
  ['Supabase', 'Auth, database access, and RLS-friendly application infrastructure.'],
  ['PostgreSQL', 'Durable operational data for agents, traces, evaluations, and usage.'],
  ['OpenAI', 'Provider-ready execution for state-of-the-art model workflows.'],
  ['Anthropic', 'Model-provider extensibility for serious AI engineering teams.']
] as const;
