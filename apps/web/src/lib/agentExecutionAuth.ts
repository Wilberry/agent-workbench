import type { User } from '@supabase/supabase-js';
import { agents, createServerSupabaseClient } from '@agent-workbench/sdk';
import type { Database } from '@agent-workbench/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export class ExecutionAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = 'ExecutionAuthorizationError';
    this.status = status;
  }
}

export class QuotaExceededError extends Error {
  status = 403;
  code = 'QUOTA_EXCEEDED';

  constructor(message: string = 'Organization has reached its run limit') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

type Supabase = SupabaseClient<Database>;

type AuthorizeExecutionInput = {
  user: User;
  agentId: string;
  conversationId: string;
  agentVersionId?: string | null;
  client?: Supabase;
};

export async function authorizeExecution({ user, agentId, conversationId, agentVersionId, client }: AuthorizeExecutionInput) {
  const supabase = client ?? createServerSupabaseClient();

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, agent_id, user_id, title, created_at')
    .eq('id', conversationId)
    .single();

  if (conversationError || !conversation) {
    throw new ExecutionAuthorizationError('Conversation not found', 404);
  }

  if (conversation.agent_id !== agentId) {
    throw new ExecutionAuthorizationError('Conversation does not belong to the provided agent', 400);
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, user_id, organization_id, name, description, system_prompt, model, created_at')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    throw new ExecutionAuthorizationError('Agent not found', 404);
  }

  const organizationId = agent.organization_id ?? null;
  let organization = null;
  let membership = null;

  if (organizationId) {
    const { data: membershipRow, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('*')
      .eq('org_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membershipRow) {
      throw new ExecutionAuthorizationError('Not authorized to execute this organization agent', 403);
    }

    membership = membershipRow;

    const { data: organizationRow, error: organizationError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    if (!organizationError && organizationRow) {
      organization = organizationRow;
    }
  } else if (agent.user_id !== user.id) {
    throw new ExecutionAuthorizationError('Not authorized to execute this agent', 403);
  }

  const ownsConversation = conversation.user_id === user.id;
  const hasOrgConversationAccess = Boolean(organizationId && membership);
  if (!ownsConversation && !hasOrgConversationAccess) {
    throw new ExecutionAuthorizationError('Not authorized to execute this conversation', 403);
  }

  let agentVersion = null;
  if (agentVersionId) {
    try {
      const version = await agents.getVersion(agentVersionId, supabase);

      if (version.agent_id !== agent.id) {
        throw new ExecutionAuthorizationError('Agent version does not belong to the requested agent', 400);
      }

      agentVersion = version;
    } catch {
      throw new ExecutionAuthorizationError('Agent version not found', 404);
    }
  } else {
    agentVersion = await agents.getLatestVersion(agent.id, supabase);
  }

  return {
    user,
    conversation,
    agent,
    organization,
    membership,
    agentVersion
  };
}
