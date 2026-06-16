export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

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
      agent_runs: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          workflow: string[];
          current_step: number;
          execution_trace: any[];
          organization_id: string | null;
          status: 'pending' | 'running' | 'completed' | 'failed';
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      agent_run_jobs: {
        Row: {
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
        };
      };
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
          workflow: string[];
          memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }>;
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
