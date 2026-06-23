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
  version_number: number;
  description: string | null;
  system_prompt: string;
  model: string;
  workflow: string[];
  tools: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  created_by?: string | null;
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

export type OrgMembershipRole = 'owner' | 'admin' | 'member' | 'viewer';

export type OrganizationMembership = {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgMembershipRole;
  created_at: string;
};

export type EvaluationDataset = {
  id: string;
  user_id: string;
  organization_id?: string | null;
  agent_id?: string | null;
  name: string;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EvaluationDatasetExample = {
  id: string;
  dataset_id: string;
  example_index: number;
  input: Record<string, unknown>;
  expected_output: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EvaluationRun = {
  id: string;
  dataset_id: string;
  agent_version_id: string;
  user_id: string;
  organization_id?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EvaluationRunResult = {
  id: string;
  evaluation_run_id: string;
  example_id: string;
  agent_output: Record<string, unknown>;
  exact_match: boolean;
  details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Experiment = {
  id: string;
  name: string;
  agent_id: string;
  version_a_id: string;
  version_b_id: string;
  dataset_id: string;
  created_by: string;
  organization_id?: string | null;
  run_a_id?: string | null;
  run_b_id?: string | null;
  status: 'draft' | 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
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

export type OrgTelemetry = {
  total_runs: number;
  total_tokens: number;
  total_estimated_cost: number;
  average_latency_ms: number;
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
  agent_version_id?: string | null;
  replay_of_run_id?: string | null;
  replay_reason?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  latency_ms?: number;
  model_name?: string | null;
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
        role: 'owner' | 'admin' | 'member' | 'viewer';
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
      marketplace_installs: SupabaseTable<{
        id: string;
        org_id: string;
        source_version_id: string;
        installed_agent_id: string;
        created_at: string;
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
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        estimated_cost: number;
        latency_ms: number;
        model_name?: string | null;
        organization_id?: string | null;
        agent_version_id?: string | null;
        replay_of_run_id?: string | null;
        replay_reason?: string | null;
        status: 'pending' | 'running' | 'completed' | 'failed';
        error_message?: string | null;
        created_at: string;
        updated_at: string;
      }>;
      tool_calls: SupabaseTable<{
        id: string;
        run_id: string;
        organization_id?: string | null;
        tool_name: string;
        status: 'success' | 'failed';
        latency_ms: number;
        input_payload: Record<string, unknown>;
        output_payload: Record<string, unknown>;
        created_at: string;
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
      agent_run_events: SupabaseTable<{
        id: string;
        run_id: string;
        event_type: string;
        payload: unknown;
        created_at: string;
      }>;
      agent_versions: SupabaseTable<{
        id: string;
        agent_id: string;
        version: string;
        description: string | null;
        system_prompt: string;
        workflow: string[];
        tools: Record<string, unknown>[];
        metadata: Record<string, unknown>;
        model: string;
        version_number: number;
        created_by: string | null;
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
      evaluation_datasets: SupabaseTable<{
        id: string;
        user_id: string;
        organization_id?: string | null;
        agent_id?: string | null;
        name: string;
        description: string | null;
        tags: string[];
        metadata: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
      evaluation_dataset_examples: SupabaseTable<{
        id: string;
        dataset_id: string;
        example_index: number;
        input: Record<string, unknown>;
        expected_output: Record<string, unknown>;
        metadata: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
      evaluation_runs: SupabaseTable<{
        id: string;
        dataset_id: string;
        agent_version_id: string;
        user_id: string;
        organization_id?: string | null;
        status: 'pending' | 'running' | 'completed' | 'failed';
        summary: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
      evaluation_run_results: SupabaseTable<{
        id: string;
        evaluation_run_id: string;
        example_id: string;
        agent_output: Record<string, unknown>;
        exact_match: boolean;
        details: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      }>;
      experiments: SupabaseTable<{
        id: string;
        name: string;
        agent_id: string;
        version_a_id: string;
        version_b_id: string;
        dataset_id: string;
        created_by: string;
        organization_id?: string | null;
        run_a_id?: string | null;
        run_b_id?: string | null;
        status: 'draft' | 'running' | 'completed' | 'failed';
        created_at: string;
        updated_at: string;
      }>;
      organization_usage_events: SupabaseTable<{
        id: string;
        organization_id: string;
        run_id: string | null;
        event_type: 'quota_reserved' | 'run_completed' | 'run_failed' | 'quota_refunded';
        tokens: number;
        estimated_cost: number;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
    };
    Views: {
      agent_latest_versions: {
        Row: {
          id: string;
          agent_id: string;
          version: string;
          description: string | null;
          system_prompt: string;
          workflow: string[];
          tools: Record<string, unknown>[];
          metadata: Record<string, unknown>;
          model: string;
          version_number: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
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
      get_organization_quota_usage: {
        Args: {
          org_id: string;
          event_type_filter?: string;
        };
        Returns: Array<{
          total_reserved: number;
          total_refunded: number;
          net_reserved: number;
          total_cost: number;
        }>;
      };
      reserve_organization_quota: {
        Args: {
          organization_id: string;
          run_id: string;
          estimated_cost?: number;
        };
        Returns: Array<{
          id: string;
          organization_id: string;
          run_id: string | null;
          event_type: 'quota_reserved' | 'run_completed' | 'run_failed' | 'quota_refunded';
          tokens: number;
          estimated_cost: number;
          metadata: Record<string, unknown>;
          created_at: string;
        }>;
      };
      get_organization_billing_metrics: {
        Args: {
          org_id: string;
        };
        Returns: Array<{
          total_runs: number;
          total_tokens: number;
          total_cost: number;
          completed_runs: number;
          failed_runs: number;
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
