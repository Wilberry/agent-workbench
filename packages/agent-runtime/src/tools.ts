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

async function persistToolCall(params: {
  runId: string;
  organizationId?: string | null;
  toolName: string;
  status: 'success' | 'failed';
  latencyMs: number;
  inputPayload: Record<string, unknown>;
  outputPayload: unknown;
}) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('tool_calls').insert([{
    run_id: params.runId,
    organization_id: params.organizationId ?? null,
    tool_name: params.toolName,
    status: params.status,
    latency_ms: params.latencyMs,
    input_payload: params.inputPayload,
    output_payload: params.outputPayload ?? {}
  }]);

  if (error) {
    console.warn('Failed to persist tool call audit:', error);
  }
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  runId?: string,
  organizationId?: string | null
) {
  const start = Date.now();
  let status: 'success' | 'failed' = 'success';
  let outputPayload: unknown = {};

  try {
    const tool = toolList.find((item) => item.name === name);
    if (tool) {
      outputPayload = await tool.execute(args);
      return outputPayload;
    }

    const supabase = createServerSupabaseClient();
    const { data: registryTool, error } = await supabase.from('tools').select('*').eq('slug', name).maybeSingle();
    if (error) throw error;
    if (!registryTool) throw new Error(`Tool not found: ${name}`);

    const entrypoint: string = registryTool.entrypoint;
    if (entrypoint && entrypoint.startsWith('http')) {
      const res = await fetch(entrypoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      const text = await res.text();
      if (!res.ok) {
        outputPayload = { status: res.status, statusText: res.statusText, body: text };
        throw new Error(`Tool invocation failed: ${res.statusText}`);
      }
      try {
        outputPayload = JSON.parse(text);
      } catch {
        outputPayload = text;
      }
      return outputPayload;
    }

    throw new Error(`Unsupported tool entrypoint for ${name}`);
  } catch (error) {
    status = 'failed';
    outputPayload = { error: error instanceof Error ? error.message : String(error) };
    throw error;
  } finally {
    if (runId) {
      await persistToolCall({
        runId,
        organizationId,
        toolName: name,
        status,
        latencyMs: Date.now() - start,
        inputPayload: args,
        outputPayload
      });
    }
  }
}
