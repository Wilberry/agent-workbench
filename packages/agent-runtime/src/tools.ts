import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { getRelevantMemories } from './memory';
import fetch from 'node-fetch';

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export const toolList: Tool[] = [
  {
    name: 'search_memory',
    description: 'Search the conversation memory for relevant user or assistant messages.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search within the conversation memory.' },
        conversationId: { type: 'string', description: 'Conversation ID associated with the memory search.' }
      },
      required: ['query', 'conversationId']
    },
    execute: async (args) => {
      const query = String(args.query);
      const conversationId = String(args.conversationId);
      return getRelevantMemories({ conversationId, query });
    }
  },
  {
    name: 'summarize_conversation',
    description: 'Summarize the conversation history into a compact overview.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID to summarize.' }
      },
      required: ['conversationId']
    },
    execute: async (args) => {
      const conversationId = String(args.conversationId);
      const supabase = createServerSupabaseClient();
      const { data: messages, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const text = (messages ?? [])
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join('\n');

      const { data, error: openaiError } = await supabase.functions.invoke('summarize_conversation', {
        body: { conversation: text }
      });

      if (openaiError) throw openaiError;
      return data;
    }
  },
  {
    name: 'get_agent_info',
    description: 'Fetch metadata about the current agent, including prompt and model details.',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to look up.' }
      },
      required: ['agentId']
    },
    execute: async (args) => {
      const agentId = String(args.agentId);
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase.from('agents').select('id, name, description, system_prompt, model').eq('id', agentId).single();
      if (error) throw error;
      return data;
    }
  }
];

export async function runTool(name: string, args: Record<string, unknown>) {
  // Try local built-in tools first
  const tool = toolList.find((item) => item.name === name);
  if (tool) return await tool.execute(args);

  // Fallback: look up registry in Supabase
  const supabase = createServerSupabaseClient();
  const { data: registryTool, error } = await supabase.from('tools').select('*').eq('slug', name).maybeSingle();
  if (error) throw error;
  if (!registryTool) throw new Error(`Tool not found: ${name}`);

  const entrypoint: string = registryTool.entrypoint;
  // If entrypoint is an HTTP endpoint, POST args to it
  if (entrypoint && entrypoint.startsWith('http')) {
    const res = await fetch(entrypoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (!res.ok) throw new Error(`Tool invocation failed: ${res.statusText}`);
    return await res.json();
  }

  // Unknown entrypoint type
  throw new Error(`Unsupported tool entrypoint for ${name}`);
}
