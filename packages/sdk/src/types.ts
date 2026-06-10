export type Agent = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  agent_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  embedding?: number[] | null;
  created_at: string;
};

export type AgentVersion = {
  id: string;
  agent_id: string;
  version: string;
  description: string | null;
  system_prompt: string;
  workflow: string[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Organization = {
  id: string;
  owner_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type OrganizationMembership = {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
};

export type MarketplaceAgent = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'public' | 'private';
  latest_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgBilling = {
  org_id: string;
  plan: 'free' | 'pro' | 'enterprise';
  tokens_used: number;
  runs_used: number;
  last_billed: string | null;
};

export type AgentRun = {
  id: string;
  user_id: string;
  conversation_id: string;
  workflow: string[];
  current_step: number;
  execution_trace: Array<{
    id?: string;
    run_id?: string;
    step?: string;
    status?: string;
    input?: any;
    output?: any;
    error?: string;
    timestamp?: string;
    metadata?: { model?: string; tokens?: number; toolName?: string } | null;
  }>;
  organization_id?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'pending';
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
      };
      agents: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          system_prompt: string;
          model: string;
          created_at: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          agent_id: string;
          user_id: string;
          title: string | null;
          created_at: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: 'user' | 'assistant';
          content: string;
          embedding?: number[] | null;
          created_at: string;
        };
      };
      organizations: {
        Row: {
          id: string;
          owner_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
      };
      organization_memberships: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          created_at: string;
        };
      };
      marketplace_agents: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          slug: string;
          description: string | null;
          visibility: 'public' | 'private';
          latest_version_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      org_billing: {
        Row: {
          org_id: string;
          plan: 'free' | 'pro' | 'enterprise';
          tokens_used: number;
          runs_used: number;
          last_billed: string | null;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};
