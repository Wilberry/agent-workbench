import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { db } from '@/lib/db';
import AgentChat from '@/components/AgentChat';
import AgentVersionHistory from '@/components/AgentVersionHistory';
import AgentVersionComparison from '@/components/AgentVersionComparison';
import QuickTestWorkflow from '@/components/QuickTestWorkflow';
import MarketplacePublishButton from '@/components/MarketplacePublishButton';

type Props = {
  params: {
    id: string;
  };
};

export default async function AgentPage({ params }: Props) {
  const supabase = createServerComponentSupabaseClient({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const agent = await db.agents.get(params.id);

  if (!agent) {
    return <div className="p-6 text-red-400">Agent not found.</div>;
  }

  // Fetch agent versions
  const versions = await db.agents.listVersions(agent.id);

  // Get current version
  const currentVersion = await db.agents.getLatestVersion(agent.id);

  let currentVisibility: 'public' | 'private' = 'private';
  if (agent.organization_id) {
    const { data: marketplaceItem } = await supabase
      .from('marketplace_agents')
      .select('visibility')
      .eq('id', agent.id)
      .eq('org_id', agent.organization_id)
      .maybeSingle();
    currentVisibility = (marketplaceItem?.visibility as 'public' | 'private') ?? 'private';
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('agent_id', agent.id)
    .eq('user_id', user?.id ?? '')
    .limit(1)
    .single();

  let conversationId = conversation?.id;

  if (!conversationId) {
    const { data: createdConversation, error: conversationError } = await supabase
      .from('conversations')
      .insert([{ agent_id: agent.id, user_id: user?.id, title: `${agent.name} chat` }])
      .select('id')
      .single();

    if (conversationError || !createdConversation) {
      return <div className="p-6 text-red-400">Unable to create conversation.</div>;
    }

    conversationId = (createdConversation as { id: string }).id;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">{agent.name}</h1>
              <p className="mt-2 text-slate-400">Chat with your agent powered by the configured model.</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
                <span>Current version: {currentVersion?.version ?? 'None'}</span>
                <span>Model: {currentVersion?.model ?? agent.model}</span>
                <span>Workflow: {currentVersion?.workflow?.length ? currentVersion.workflow.join(' → ') : 'Default'}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={`/agents/${agent.id}/edit`}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
              >
                Edit agent
              </Link>
              <Link
                href={{ pathname: '/agents/[id]/versions/new', query: { id: agent.id } }}
                className="rounded-2xl border border-slate-700 bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Create version
              </Link>
            </div>
          </div>
        </div>

        {versions && versions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Version History</h2>
            <AgentVersionHistory
              agentId={agent.id}
              versions={versions}
              currentVersion={currentVersion}
            />
          </div>
        )}

        {versions && versions.length >= 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Compare Versions</h2>
            <AgentVersionComparison agentId={agent.id} versions={versions} />
          </div>
        )}

        {versions && versions.length > 0 && user && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Quick Test</h2>
            <QuickTestWorkflow agentId={agent.id} conversationId={conversationId} versions={versions} />
          </div>
        )}

        {agent.organization_id ? (
          <MarketplacePublishButton
            orgId={agent.organization_id}
            itemId={agent.id}
            initialVisibility={currentVisibility}
          />
        ) : (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4 text-slate-400">
            Marketplace publishing is available for organization-scoped agents only.
          </div>
        )}

        <AgentChat agentId={agent.id} conversationId={conversationId} />
      </div>
    </main>
  );
}

