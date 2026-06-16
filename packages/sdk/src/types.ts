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
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseTable<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    referencedRelation: string;
    referencedColumns: string[];
    isOneToOne?: boolean;
  }[];
};

export type Database = {
  public: {
    Tables: {
      profiles: SupabaseTable<{
        id: string;
        user_id: string;
        full_name: string | null;
        avatar_url: string | null;
        created_at: string;
      }>;
      agents: SupabaseTable<{
        id: string;
        user_id: string;
        organization_id?: string | null;
        name: string;
        description: string | null;
        system_prompt: string;
        model: string;
        created_at: string;
      }>;
      conversations: SupabaseTable<{
        id: string;
        agent_id: string;
        user_id: string;
        title: string | null;
        created_at: string;
      }>;
      messages: SupabaseTable<{
        id: string;
        conversation_id: string;
        role: 'user' | 'assistant';
        content: string;
        embedding?: number[] | null;
        created_at: string;
      }>;
      organizations: SupabaseTable<{
        id: string;
        owner_id: string | null;
        name: string;
        slug: string;
        description: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
      organization_memberships: SupabaseTable<{
        id: string;
        org_id: string;
        user_id: string;
        role: 'owner' | 'admin' | 'member';
        created_at: string;
      }>;
      marketplace_agents: SupabaseTable<{
        id: string;
        org_id: string;
        name: string;
        slug: string;
        description: string | null;
        visibility: 'public' | 'private';
        latest_version_id: string | null;
        created_at: string;
        updated_at: string;
      }>;
      org_billing: SupabaseTable<{
        org_id: string;
        plan: 'free' | 'pro' | 'enterprise';
        tokens_used: number;
        runs_used: number;
        last_billed: string | null;
        created_at: string;
        updated_at: string;
      }>;
      agent_runs: SupabaseTable<{
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
        status: 'pending' | 'running' | 'completed' | 'failed';
        error_message?: string | null;
        created_at: string;
        updated_at: string;
      }>;
      agent_run_jobs: SupabaseTable<{
        id: string;
        run_id: string;
        user_id: string;
        conversation_id: string;
        message: string;
        workflow: string[];
        memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }>;
        status: 'pending' | 'running' | 'completed' | 'failed';
        attempts: number;
        max_attempts: number;
        locked_at: string | null;
        error_message: string | null;
        created_at: string;
        updated_at: string;
      }>;
      agent_versions: SupabaseTable<{
        id: string;
        agent_id: string;
        version: string;
        description: string | null;
        system_prompt: string;
        workflow: string[];
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      tools: SupabaseTable<{
        id: string;
        org_id: string | null;
        name: string;
        slug: string;
        description: string | null;
        entrypoint: string;
        input_schema: Record<string, unknown> | null;
        output_schema: Record<string, unknown> | null;
        runtime: Record<string, unknown> | null;
        public: boolean;
        metadata: Record<string, unknown>;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: {};
    Functions: {
      dequeue_agent_run_job: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          run_id: string;
          user_id: string;
          conversation_id: string;
          message: string;
          workflow: unknown;
          memories: unknown;
          status: 'pending' | 'running' | 'completed' | 'failed';
          created_at: string;
          updated_at: string;
        }>;
      };
      reclaim_stale_agent_run_jobs: {
        Args: {
          lease_interval?: string;
        };
        Returns: Array<{
          id: string;
        }>;
      };
      match_messages: {
        Args: {
          query_embedding: number[];
          match_threshold?: number | null;
          match_count?: number | null;
        };
        Returns: Array<{
          id: string;
          conversation_id: string;
          content: string;
          similarity: number;
        }>;
      };
    };
    Enums: {};
  };
};
