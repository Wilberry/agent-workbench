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
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};
