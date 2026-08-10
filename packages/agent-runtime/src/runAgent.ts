import type { Message } from '@agent-workbench/sdk';
import { agents, createServerSupabaseClient } from '@agent-workbench/sdk';
import { generateEmbedding } from './embeddings';
import { getRelevantMemories } from './memory';
import { resolveExecutionToolDefinitions } from './tools';
import { runMultiAgentWorkflow } from './agentRouter';
import type { LLMMessage, LLMToolDefinition } from './llm/types';
import { executeLLMToolLoop } from './toolExecution';
import { updateRunTelemetry } from './queue';
import { persistTraceEvent } from './tracing';

export type ExecutionTrace = {
  memoryUsed: boolean;
  toolsCalled: string[];
  modelIterations: number;
  provider_name?: string;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  latency_ms?: number;
  workflow_failed?: boolean;
  fallback_reason?: string;
};

function formatMemoryContext(memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }>) {
  if (memories.length === 0) {
    return 'No relevant memory was found for this conversation.';
  }

  return memories
    .map(
      (memory) =>
        `- ${memory.role === 'user' ? 'User said' : 'Assistant responded'}: ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`
    )
    .join('\n');
}

function buildSystemPrompt(agentPrompt: string, tools: LLMToolDefinition[], memoryContext: string) {
  const toolDescriptions = tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return `You are an AI agent inside a multi-agent workbench system.

You may:
- Use tools when needed.
- Use memory context to improve responses.
- Ask clarifying questions when the user request is ambiguous.

TOOLS AVAILABLE:
${toolDescriptions || '- No tools are enabled for this agent version.'}

Use structured tool calling when it is available. Legacy fallback only: if structured tool calling is unavailable and you must call a tool, respond exactly with:
TOOL_CALL: {"name":"tool_name","args":{...}}

MEMORY CONTEXT:
${memoryContext}

CONVERSATION HISTORY:
${agentPrompt}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeProviderName(provider?: string | null): string {
  return provider?.trim().toLowerCase() || 'openai';
}

export async function runAgent({
  agentId,
  conversationId,
  userMessage,
  debug = false,
  runId
}: {
  agentId: string;
  conversationId: string;
  userMessage: string;
  debug?: boolean;
  runId?: string;
}) {
  const supabase = createServerSupabaseClient();

  const { agent, latestVersion } = await agents.getAgentForExecution(agentId, supabase);

  const persistEvent = async (eventType: string, payload: unknown = {}) => {
    if (!runId) return;
    void persistTraceEvent(runId, eventType, payload).catch((err) => console.warn('Failed to persist trace event', err));
  };

  const { data: userMessageRow, error: userMessageError } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, role: 'user', content: userMessage }])
    .select('id')
    .single();

  if (userMessageError || !userMessageRow) {
    throw userMessageError ?? new Error('Failed to persist user message');
  }

  const userEmbeddingPromise = generateEmbedding(userMessage)
    .then((vector) =>
      supabase.from('messages').update({ embedding: vector }).eq('id', (userMessageRow as Pick<Message, 'id'>).id)
    )
    .catch((error) => {
      console.error('Failed to generate user message embedding:', error);
    });

  const { data: history, error: historyError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (historyError) {
    throw historyError;
  }

  const memories = await getRelevantMemories({ conversationId, query: userMessage });
  const memoryContext = formatMemoryContext(memories);
  const conversationHistory: LLMMessage[] = ((history ?? []) as Message[]).map((message) => ({
    role: message.role,
    content: message.content
  }));

  let selectedSystemPrompt = agent.system_prompt;
  let selectedModel = agent.model ?? 'gpt-4o-mini';
  let selectedProvider = normalizeProviderName(agent.provider);
  let versionWorkflow: string[] | undefined = undefined;
  let versionTools: unknown = undefined;

  if (latestVersion) {
    if (latestVersion.system_prompt) selectedSystemPrompt = latestVersion.system_prompt;
    if (latestVersion.model) selectedModel = latestVersion.model;
    if (latestVersion.provider) selectedProvider = normalizeProviderName(latestVersion.provider);
    if (latestVersion.metadata && typeof latestVersion.metadata.model === 'string') {
      selectedModel = latestVersion.metadata.model;
    }
    if (latestVersion.metadata && typeof latestVersion.metadata.provider === 'string') {
      selectedProvider = normalizeProviderName(latestVersion.metadata.provider);
    }
    if (Array.isArray(latestVersion.workflow) && latestVersion.workflow.length > 0) {
      versionWorkflow = latestVersion.workflow;
    }
    if (Array.isArray(latestVersion.tools) && latestVersion.tools.length > 0) {
      versionTools = latestVersion.tools;
    }
  }

  let ownerUserId: string | null = null;
  if (!agent.organization_id && Array.isArray(versionTools) && versionTools.length > 0) {
    const fullAgent = await agents.get(agentId, supabase);
    ownerUserId = fullAgent?.user_id ?? null;
  }

  const availableTools = await resolveExecutionToolDefinitions({
    versionTools,
    organizationId: agent.organization_id,
    ownerUserId,
    client: supabase
  });
  const baseSystemPrompt = buildSystemPrompt(selectedSystemPrompt, availableTools, memoryContext);
  const messageBatch: LLMMessage[] = [
    { role: 'system', content: baseSystemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const toolsCalled: string[] = [];
  let modelIterations = 0;
  let finalAssistantResponse = '';
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalEstimatedCost = 0;
  let totalLatencyMs = 0;
  let lastProviderName: string | undefined;
  let lastModelName: string | undefined;
  let workflowFailed = false;
  let fallbackReason: string | undefined;

  if (Array.isArray(versionWorkflow) && versionWorkflow.length > 0) {
    const { data: userInfo } = await supabase.auth.getUser();
    const userId = userInfo?.user?.id ?? '';
    try {
      void persistEvent('run_started', {
        workflow: versionWorkflow,
        message: userMessage,
        provider: selectedProvider,
        model: selectedModel
      });
      const result = await runMultiAgentWorkflow({
        userId,
        conversationId,
        message: userMessage,
        workflow: versionWorkflow,
        memories,
        systemPrompt: selectedSystemPrompt,
        runId,
        organizationId: agent.organization_id,
        ownerUserId,
        tools: availableTools
      }, selectedModel, selectedProvider);

      finalAssistantResponse = result.message;
      void persistEvent('run_completed', {
        provider_name: result.trace.provider_name,
        model_name: result.trace.model_name,
        trace: result.trace
      });
      toolsCalled.push(...(result.trace.toolsCalled || []));
      modelIterations = result.trace.modelIterations || modelIterations;
      totalPromptTokens = result.trace.prompt_tokens ?? totalPromptTokens;
      totalCompletionTokens = result.trace.completion_tokens ?? totalCompletionTokens;
      totalTokens = result.trace.total_tokens ?? totalTokens;
      totalEstimatedCost = result.trace.estimated_cost ?? totalEstimatedCost;
      totalLatencyMs = result.trace.latency_ms ?? totalLatencyMs;
      lastProviderName = result.trace.provider_name ?? lastProviderName;
      lastModelName = result.trace.model_name ?? lastModelName;
    } catch (err) {
      workflowFailed = true;
      fallbackReason = errorMessage(err);
      console.error('Multi-agent workflow failed, falling back to single-agent:', err);
      void persistEvent('workflow_failed', {
        workflow: versionWorkflow,
        provider: selectedProvider,
        model: selectedModel,
        error: fallbackReason,
        fallback: 'single-agent'
      });
    }
  }

  if (!finalAssistantResponse) {
    void persistEvent('run_started', {
      workflow: ['single-agent'],
      message: userMessage,
      provider: selectedProvider,
      model: selectedModel,
      fallback: workflowFailed
    });

    const result = await executeLLMToolLoop({
      provider: selectedProvider,
      model: selectedModel,
      messages: messageBatch,
      tools: availableTools,
      runId,
      organizationId: agent.organization_id,
      ownerUserId,
      maxToolRounds: 2,
      onToolExecuted(record) {
        void persistEvent('tool_call', {
          name: record.call.name,
          args: record.call.arguments,
          latency_ms: record.latency_ms,
          mode: record.mode
        });
      }
    });

    finalAssistantResponse = result.content;
    toolsCalled.push(...result.toolsCalled);
    modelIterations += result.modelIterations;
    totalPromptTokens += result.prompt_tokens;
    totalCompletionTokens += result.completion_tokens;
    totalTokens += result.total_tokens;
    totalEstimatedCost += result.estimated_cost;
    totalLatencyMs += result.latency_ms;
    lastProviderName = result.provider_name ?? lastProviderName;
    lastModelName = result.model_name ?? lastModelName;
  }

  if (!finalAssistantResponse) {
    finalAssistantResponse = 'I was unable to complete the task after multiple tool executions.';
  }

  const trace: ExecutionTrace = {
    memoryUsed: memories.length > 0,
    toolsCalled,
    modelIterations,
    provider_name: lastProviderName,
    model_name: lastModelName,
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    total_tokens: totalTokens,
    estimated_cost: totalEstimatedCost,
    latency_ms: totalLatencyMs,
    workflow_failed: workflowFailed || undefined,
    fallback_reason: fallbackReason
  };

  if (runId) {
    await updateRunTelemetry(runId, {
      input_tokens: totalPromptTokens,
      output_tokens: totalCompletionTokens,
      total_tokens: totalTokens,
      estimated_cost: totalEstimatedCost,
      latency_ms: totalLatencyMs,
      provider_name: lastProviderName ?? selectedProvider,
      model_name: lastModelName ?? selectedModel
    });
  }

  if (debug) {
    return new Response(JSON.stringify({ response: finalAssistantResponse, trace }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const textStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const chunkSize = 1024;
      for (let i = 0; i < finalAssistantResponse.length; i += chunkSize) {
        const chunk = finalAssistantResponse.slice(i, i + chunkSize);
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });

  const { data: assistantRow, error: assistantError } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, role: 'assistant', content: finalAssistantResponse }])
    .select('id')
    .single();

  if (assistantError || !assistantRow) {
    console.error('Failed to persist assistant message:', assistantError);
  } else {
    try {
      const assistantEmbedding = await generateEmbedding(finalAssistantResponse);
      await supabase.from('messages').update({ embedding: assistantEmbedding }).eq('id', (assistantRow as Pick<Message, 'id'>).id);
    } catch (error) {
      console.error('Failed to generate assistant embedding:', error);
    }
  }

  await userEmbeddingPromise;

  return new Response(textStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
