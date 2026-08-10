import type { Message } from '@agent-workbench/sdk';
import { agents, createServerSupabaseClient } from '@agent-workbench/sdk';
import { generateEmbedding } from './embeddings';
import { getRelevantMemories } from './memory';
import { runTool, toolList } from './tools';
import { runMultiAgentWorkflow } from './agentRouter';
import { chatCompletion } from './llm/client';
import { updateRunTelemetry } from './queue';
import { persistTraceEvent } from './tracing';

export type ExecutionTrace = {
  memoryUsed: boolean;
  toolsCalled: string[];
  modelIterations: number;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number | null;
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

function buildSystemPrompt(agentPrompt: string, tools: typeof toolList, memoryContext: string) {
  const toolDescriptions = tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return `You are an AI agent inside a multi-agent workbench system.

You may:
- Use tools when needed.
- Use memory context to improve responses.
- Ask clarifying questions when the user request is ambiguous.

TOOLS AVAILABLE:
${toolDescriptions}

When calling a tool, respond exactly with the following format:
TOOL_CALL: {"name":"tool_name","args":{...}}
Only call a tool when necessary.

MEMORY CONTEXT:
${memoryContext}

CONVERSATION HISTORY:
${agentPrompt}`;
}

function parseToolCall(text: string) {
  const match = text.match(/TOOL_CALL:\s*({[\s\S]*})/);
  if (!match) return null;

  try {
    const toolCall = JSON.parse(match[1]);
    if (typeof toolCall.name !== 'string' || typeof toolCall.args !== 'object') {
      return null;
    }
    return toolCall as { name: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
}

function addEstimatedCost(total: number | null, next: number | null): number | null {
  if (total === null || next === null) {
    return null;
  }
  return total + next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const conversationHistory = ((history ?? []) as Message[]).map((message) => ({ role: message.role, content: message.content }));

  let selectedSystemPrompt = agent.system_prompt;
  let selectedModel = agent.model ?? 'gpt-4o-mini';
  let versionWorkflow: string[] | undefined = undefined;

  if (latestVersion) {
    if (latestVersion.system_prompt) selectedSystemPrompt = latestVersion.system_prompt;
    if (latestVersion.metadata && typeof latestVersion.metadata.model === 'string') {
      selectedModel = latestVersion.metadata.model;
    }
    if (Array.isArray(latestVersion.workflow) && latestVersion.workflow.length > 0) {
      versionWorkflow = latestVersion.workflow;
    }
  }

  const baseSystemPrompt = buildSystemPrompt(selectedSystemPrompt, toolList, memoryContext);
  const messageBatch: Array<{ role: string; content: string }> = [
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
  let totalEstimatedCost: number | null = 0;
  let totalLatencyMs = 0;
  let lastModelName: string | undefined;
  let workflowFailed = false;
  let fallbackReason: string | undefined;

  if (Array.isArray(versionWorkflow) && versionWorkflow.length > 0) {
    const { data: userInfo } = await supabase.auth.getUser();
    const userId = userInfo?.user?.id ?? '';
    try {
      void persistEvent('run_started', { workflow: versionWorkflow, message: userMessage });
      const result = await runMultiAgentWorkflow({
        userId,
        conversationId,
        message: userMessage,
        workflow: versionWorkflow,
        memories,
        runId
      }, selectedModel);

      finalAssistantResponse = result.message;
      void persistEvent('run_completed', { model_name: result.trace.model_name, trace: result.trace });
      toolsCalled.push(...(result.trace.toolsCalled || []));
      modelIterations = result.trace.modelIterations || modelIterations;
      totalPromptTokens = result.trace.prompt_tokens ?? totalPromptTokens;
      totalCompletionTokens = result.trace.completion_tokens ?? totalCompletionTokens;
      totalTokens = result.trace.total_tokens ?? totalTokens;
      if (result.trace.estimated_cost !== undefined) {
        totalEstimatedCost = result.trace.estimated_cost;
      }
      totalLatencyMs = result.trace.latency_ms ?? totalLatencyMs;
      lastModelName = result.trace.model_name ?? lastModelName;
    } catch (err) {
      workflowFailed = true;
      fallbackReason = errorMessage(err);
      console.error('Multi-agent workflow failed, falling back to single-agent:', err);
      void persistEvent('workflow_failed', {
        workflow: versionWorkflow,
        error: fallbackReason,
        fallback: 'single-agent'
      });
    }
  }

  if (!finalAssistantResponse) {
    let currentMessages = [...messageBatch];
    void persistEvent('run_started', {
      workflow: ['single-agent'],
      message: userMessage,
      fallback: workflowFailed
    });
    for (let iteration = 0; iteration < 3; iteration += 1) {
      modelIterations += 1;
      const assistantResult = await chatCompletion({
        model: selectedModel,
        messages: currentMessages,
        temperature: 0.7,
        max_tokens: 1200
      });
      totalPromptTokens += assistantResult.prompt_tokens;
      totalCompletionTokens += assistantResult.completion_tokens;
      totalTokens += assistantResult.total_tokens;
      totalEstimatedCost = addEstimatedCost(totalEstimatedCost, assistantResult.estimated_cost);
      totalLatencyMs += assistantResult.latency_ms;
      lastModelName = assistantResult.model_name;

      const assistantResponse = assistantResult.content;
      const toolCall = parseToolCall(assistantResponse);

      if (!toolCall) {
        finalAssistantResponse = assistantResponse;
        break;
      }

      toolsCalled.push(toolCall.name);
      const toolStart = Date.now();
      const toolResult = await runTool(toolCall.name, toolCall.args, runId);
      void persistEvent('tool_call', { name: toolCall.name, args: toolCall.args, latency_ms: Date.now() - toolStart });
      const toolResultText = JSON.stringify(toolResult, null, 2);

      currentMessages.push({ role: 'assistant', content: assistantResponse });
      currentMessages.push({ role: 'system', content: `Tool ${toolCall.name} executed. Result:\n${toolResultText}` });
      currentMessages.push({ role: 'user', content: 'Continue the response using the tool result above.' });
    }
  }

  if (!finalAssistantResponse) {
    finalAssistantResponse = 'I was unable to complete the task after multiple tool executions.';
  }

  const trace: ExecutionTrace = {
    memoryUsed: memories.length > 0,
    toolsCalled,
    modelIterations,
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
      estimated_cost: totalEstimatedCost ?? undefined,
      latency_ms: totalLatencyMs,
      model_name: lastModelName ?? null
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
