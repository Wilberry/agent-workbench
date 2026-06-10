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
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};
