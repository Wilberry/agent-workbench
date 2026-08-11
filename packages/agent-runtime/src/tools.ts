import { agents, createServerSupabaseClient } from '@agent-workbench/sdk';
import type { LLMToolDefinition } from './llm/types';
import { getRelevantMemories } from './memory';
import fetch from 'node-fetch';

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export type ToolExecutionContext = {
  ownerUserId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
};

type ConversationSummaryMessage = {
  role: string;
  content: string;
};

type RegistryToolRow = {
  id: string;
  org_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  entrypoint: string;
  input_schema: unknown;
  public: boolean | null;
  created_by: string | null;
};

type ToolReference = string | Record<string, unknown>;
type ServerSupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const toolList: Tool[] = [
  {
    name: 'search_memory',
    description: 'Search the current conversation memory for relevant user or assistant messages.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search within the current conversation memory.' }
      },
      required: ['query']
    },
    execute: async (args) => {
      const query = String(args.query);
      const conversationId = String(args.conversationId);
      return getRelevantMemories({ conversationId, query });
    }
  },
  {
    name: 'summarize_conversation',
    description: 'Summarize the current conversation history into a compact overview.',
    parameters: {
      type: 'object',
      properties: {}
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

      const text = ((messages ?? []) as ConversationSummaryMessage[])
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
      properties: {}
    },
    execute: async (args) => {
      const agentId = String(args.agentId);
      return await agents.get(agentId);
    }
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToolReferences(versionTools: unknown): ToolReference[] {
  if (!Array.isArray(versionTools)) return [];
  return versionTools.filter(
    (entry): entry is ToolReference => typeof entry === 'string' || isRecord(entry)
  );
}

function builtInDefinition(tool: Tool): LLMToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  };
}

export function getBuiltInToolDefinitions(): LLMToolDefinition[] {
  return toolList.map(builtInDefinition);
}

function referenceValue(reference: ToolReference, key: 'id' | 'slug' | 'name'): string | undefined {
  if (typeof reference === 'string') {
    return key === 'name' || key === 'slug' ? reference.trim() || undefined : undefined;
  }
  const value = reference[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function canAccessRegistryTool(
  tool: RegistryToolRow,
  organizationId?: string | null,
  ownerUserId?: string | null
): boolean {
  if (tool.public === true) return true;
  if (organizationId && tool.org_id === organizationId) return true;
  if (!organizationId && !tool.org_id && ownerUserId && tool.created_by === ownerUserId) return true;
  return false;
}

function registryScopeRank(
  tool: RegistryToolRow,
  organizationId?: string | null,
  ownerUserId?: string | null
): number {
  if (organizationId && tool.org_id === organizationId) return 0;
  if (!organizationId && !tool.org_id && ownerUserId && tool.created_by === ownerUserId) return 1;
  if (tool.public === true) return 2;
  return 3;
}

function chooseAccessibleRegistryTool(
  tools: RegistryToolRow[],
  organizationId?: string | null,
  ownerUserId?: string | null
): RegistryToolRow | null {
  return tools
    .filter((tool) => canAccessRegistryTool(tool, organizationId, ownerUserId))
    .sort(
      (a, b) =>
        registryScopeRank(a, organizationId, ownerUserId) -
        registryScopeRank(b, organizationId, ownerUserId)
    )[0] ?? null;
}

function registryDefinition(tool: RegistryToolRow): LLMToolDefinition {
  return {
    name: tool.slug,
    description: tool.description?.trim() || tool.name,
    input_schema: isRecord(tool.input_schema)
      ? tool.input_schema
      : { type: 'object', properties: {} }
  };
}

async function queryRegistryTools(
  client: ServerSupabaseClient,
  field: 'id' | 'slug' | 'name',
  value: string
): Promise<RegistryToolRow[]> {
  const { data, error } = await client
    .from('tools')
    .select('id, org_id, name, slug, description, entrypoint, input_schema, public, created_by')
    .eq(field, value)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as RegistryToolRow[];
}

async function resolveRegistryReference(
  reference: ToolReference,
  client: ServerSupabaseClient,
  organizationId?: string | null,
  ownerUserId?: string | null
): Promise<RegistryToolRow | null> {
  const id = referenceValue(reference, 'id');
  const slug = referenceValue(reference, 'slug');
  const name = referenceValue(reference, 'name');
  const candidateGroups: RegistryToolRow[][] = [];

  if (id) candidateGroups.push(await queryRegistryTools(client, 'id', id));
  if (slug) candidateGroups.push(await queryRegistryTools(client, 'slug', slug));
  if (name && name !== slug) {
    candidateGroups.push(await queryRegistryTools(client, 'slug', name));
    candidateGroups.push(await queryRegistryTools(client, 'name', name));
  }

  const candidates = Array.from(
    new Map(candidateGroups.flat().map((tool) => [tool.id, tool])).values()
  );
  return chooseAccessibleRegistryTool(candidates, organizationId, ownerUserId);
}

export async function resolveExecutionToolDefinitions({
  versionTools,
  organizationId,
  ownerUserId,
  client
}: {
  versionTools?: unknown;
  organizationId?: string | null;
  ownerUserId?: string | null;
  client?: ServerSupabaseClient;
} = {}): Promise<LLMToolDefinition[]> {
  const references = normalizeToolReferences(versionTools);

  // Preserve the historical runtime contract: versions that do not pin tools
  // receive the built-in tool set. A non-empty version list becomes an
  // explicit allowlist.
  if (references.length === 0) {
    return getBuiltInToolDefinitions();
  }

  const builtIns = new Map(toolList.map((tool) => [tool.name, tool]));
  const definitions = new Map<string, LLMToolDefinition>();
  let supabase = client;

  for (const reference of references) {
    const requestedName = referenceValue(reference, 'name') ?? referenceValue(reference, 'slug');
    const builtIn = requestedName ? builtIns.get(requestedName) : undefined;
    if (builtIn) {
      definitions.set(builtIn.name, builtInDefinition(builtIn));
      continue;
    }

    if (!supabase) {
      supabase = createServerSupabaseClient();
    }

    const registryTool = await resolveRegistryReference(
      reference,
      supabase,
      organizationId,
      ownerUserId
    );
    if (!registryTool) {
      const label =
        referenceValue(reference, 'id') ??
        referenceValue(reference, 'slug') ??
        referenceValue(reference, 'name') ??
        '[invalid tool reference]';
      console.warn(`Skipping unresolved or unauthorized agent-version tool: ${label}`);
      continue;
    }

    const definition = registryDefinition(registryTool);
    definitions.set(definition.name, definition);
  }

  return Array.from(definitions.values());
}

async function resolveContextFromRun(
  runId: string,
  context: ToolExecutionContext | undefined,
  client: ServerSupabaseClient
): Promise<ToolExecutionContext> {
  if (context?.agentId && context?.conversationId) return context;

  const { data: run, error: runError } = await client
    .from('agent_runs')
    .select('conversation_id, user_id')
    .eq('id', runId)
    .single();
  if (runError || !run?.conversation_id) {
    throw runError ?? new Error(`Unable to resolve execution context for run ${runId}`);
  }

  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('agent_id')
    .eq('id', run.conversation_id)
    .single();
  if (conversationError || !conversation?.agent_id) {
    throw conversationError ?? new Error(`Unable to resolve agent context for run ${runId}`);
  }

  return {
    ownerUserId: context?.ownerUserId ?? run.user_id ?? null,
    conversationId: context?.conversationId ?? run.conversation_id,
    agentId: context?.agentId ?? conversation.agent_id
  };
}

function contextualizeBuiltInArgs(
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext
): Record<string, unknown> {
  if (toolName === 'search_memory' || toolName === 'summarize_conversation') {
    const conversationId = context?.conversationId ??
      (typeof args.conversationId === 'string' ? args.conversationId : undefined);
    if (!conversationId) {
      throw new Error(`Tool ${toolName} requires the active conversation context`);
    }
    return { ...args, conversationId };
  }

  if (toolName === 'get_agent_info') {
    const agentId = context?.agentId ??
      (typeof args.agentId === 'string' ? args.agentId : undefined);
    if (!agentId) {
      throw new Error('Tool get_agent_info requires the active agent context');
    }
    return { ...args, agentId };
  }

  return args;
}

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
  organizationId?: string | null,
  context?: ToolExecutionContext
) {
  const start = Date.now();
  let status: 'success' | 'failed' = 'success';
  let outputPayload: unknown = {};
  let inputPayload = args;

  try {
    const tool = toolList.find((item) => item.name === name);
    if (tool) {
      const supabase = createServerSupabaseClient();
      const executionContext = runId
        ? await resolveContextFromRun(runId, context, supabase)
        : context;
      inputPayload = contextualizeBuiltInArgs(name, args, executionContext);
      outputPayload = await tool.execute(inputPayload);
      return outputPayload;
    }

    const supabase = createServerSupabaseClient();
    const registryTool = chooseAccessibleRegistryTool(
      await queryRegistryTools(supabase, 'slug', name),
      organizationId,
      context?.ownerUserId
    );
    if (!registryTool) throw new Error(`Tool not found or not allowed: ${name}`);

    const entrypoint = registryTool.entrypoint;
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
        inputPayload,
        outputPayload
      });
    }
  }
}
