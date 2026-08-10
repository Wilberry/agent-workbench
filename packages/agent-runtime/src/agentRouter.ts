import { runTool } from './tools';
import { chatCompletion } from './llm/client';
import type { LLMResponse } from './llm/types';

export type ExecutionTrace = {
  memoryUsed: boolean;
  toolsCalled: string[];
  modelIterations: number;
  agentsUsed: string[];
  provider_name?: string;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  latency_ms?: number;
  steps?: Array<{ name: string; latency?: number; input?: unknown; output?: unknown }>;
};

type MemorySnippet = {
  role: 'user' | 'assistant';
  content: string;
  similarity: number;
};

type AgentWorkflowInput = {
  userId: string;
  conversationId: string;
  message: string;
  workflow?: string[];
  memories?: MemorySnippet[];
  systemPrompt?: string;
  runId?: string;
};

export type AgentWorkflowResult = {
  message: string;
  trace: ExecutionTrace;
};

export async function callLLM(
  messages: Array<{ role: string; content: string }>,
  model = 'gpt-4o-mini',
  provider = 'openai'
): Promise<LLMResponse> {
  return chatCompletion({
    provider,
    model,
    messages,
    temperature: 0.7,
    max_tokens: 1200
  });
}

export async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  model = 'gpt-4o-mini'
): Promise<LLMResponse> {
  return callLLM(messages, model, 'openai');
}

function formatMemoryContext(memories: MemorySnippet[] = []) {
  if (memories.length === 0) {
    return 'No relevant memory found for this request.';
  }

  return memories
    .map((memory) =>
      `- ${memory.role === 'user' ? 'User said' : 'Assistant responded'}: ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`
    )
    .join('\n');
}

function parseToolCall(text: string) {
  const match = text.match(/TOOL_CALL:\s*({[\s\S]*})/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed.name !== 'string' || typeof parsed.args !== 'object' || parsed.args === null) {
      return null;
    }
    return parsed as { name: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
}

function roleDescription(role: string) {
  switch (role.toLowerCase()) {
    case 'planner':
      return 'You break the user task into concise, ordered steps that an executor can follow.';
    case 'executor':
      return 'You execute the plan and generate a practical result or analysis based on the user goal.';
    case 'reviewer':
      return 'You verify the executor output, improve it if needed, and provide a final, polished response.';
    default:
      return `You act as ${role} within a multi-agent orchestration pipeline.`;
  }
}

export async function runMultiAgentWorkflow(
  { userId, conversationId, message, workflow, memories = [], systemPrompt, runId }: AgentWorkflowInput,
  modelOverride?: string,
  providerOverride = 'openai'
): Promise<AgentWorkflowResult> {
  const agentRoles = workflow && workflow.length > 0 ? workflow : ['Planner', 'Executor', 'Reviewer'];
  const memoryContext = formatMemoryContext(memories);
  const toolsCalled: string[] = [];
  let modelIterations = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalEstimatedCost = 0;
  let totalLatencyMs = 0;
  let lastProviderName: string | undefined;
  let lastModelName: string | undefined;
  const episode: string[] = [];
  const steps: Array<{ name: string; latency?: number; input?: unknown; output?: unknown }> = [];

  for (const role of agentRoles) {
    const systemContent = `You are ${role}. ${roleDescription(role)} Use available memory and tools when appropriate.`;
    const rolePrompt = [
      {
        role: 'system',
        content: systemPrompt ? `${systemPrompt}\n\n${systemContent}` : systemContent
      },
      {
        role: 'user',
        content: `User task: ${message}\n\nMemory context:\n${memoryContext}\n\nPrevious agent output:\n${episode.join('\n')}\n\nRespond with your assigned role output.`
      }
    ];

    const agentResponse = await callLLM(rolePrompt, modelOverride ?? 'gpt-4o-mini', providerOverride);
    modelIterations += 1;
    let finalOutput = agentResponse.content;
    totalPromptTokens += agentResponse.prompt_tokens;
    totalCompletionTokens += agentResponse.completion_tokens;
    totalTokens += agentResponse.total_tokens;
    totalEstimatedCost += agentResponse.estimated_cost;
    totalLatencyMs += agentResponse.latency_ms;
    lastProviderName = agentResponse.provider_name;
    lastModelName = agentResponse.model_name;

    const toolCall = parseToolCall(finalOutput);
    if (toolCall) {
      toolsCalled.push(toolCall.name);
      const toolStart = Date.now();
      const toolResult = await runTool(toolCall.name, toolCall.args, runId);
      const toolLatency = Date.now() - toolStart;
      steps.push({ name: `tool:${toolCall.name}`, latency: toolLatency, input: toolCall.args, output: toolResult });

      const toolPrompt = [
        ...rolePrompt,
        {
          role: 'system',
          content: `Tool ${toolCall.name} executed. Result:\n${JSON.stringify(toolResult, null, 2)}`
        },
        {
          role: 'user',
          content: 'Use the tool result to continue your role output and complete the task.'
        }
      ];

      const toolResponse = await callLLM(toolPrompt, modelOverride ?? 'gpt-4o-mini', providerOverride);
      finalOutput = toolResponse.content;
      modelIterations += 1;
      totalPromptTokens += toolResponse.prompt_tokens;
      totalCompletionTokens += toolResponse.completion_tokens;
      totalTokens += toolResponse.total_tokens;
      totalEstimatedCost += toolResponse.estimated_cost;
      totalLatencyMs += toolResponse.latency_ms;
      lastProviderName = toolResponse.provider_name;
      lastModelName = toolResponse.model_name;
    }

    const roleLatency = (agentResponse?.latency_ms as number | undefined) ?? undefined;
    steps.push({ name: `${role}`, latency: roleLatency, input: undefined, output: finalOutput });

    episode.push(`${role.toUpperCase()} OUTPUT:\n  ${finalOutput}`);
  }

  return {
    message: episode[episode.length - 1] ?? '',
    trace: {
      memoryUsed: memories.length > 0,
      toolsCalled,
      modelIterations,
      agentsUsed: agentRoles,
      provider_name: lastProviderName,
      model_name: lastModelName,
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalTokens,
      estimated_cost: totalEstimatedCost,
      latency_ms: totalLatencyMs,
      steps
    }
  };
}
