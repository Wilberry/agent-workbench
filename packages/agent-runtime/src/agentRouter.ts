import { chatCompletion } from './llm/client';
import type { LLMMessage, LLMResponse, LLMToolDefinition } from './llm/types';
import { getBuiltInToolDefinitions } from './tools';
import { executeLLMToolLoop } from './toolExecution';

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
  organizationId?: string | null;
  ownerUserId?: string | null;
  tools?: LLMToolDefinition[];
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
  {
    userId: _userId,
    conversationId: _conversationId,
    message,
    workflow,
    memories = [],
    systemPrompt,
    runId,
    organizationId,
    ownerUserId,
    tools
  }: AgentWorkflowInput,
  modelOverride?: string,
  providerOverride = 'openai'
): Promise<AgentWorkflowResult> {
  const agentRoles = workflow && workflow.length > 0 ? workflow : ['Planner', 'Executor', 'Reviewer'];
  const memoryContext = formatMemoryContext(memories);
  const availableTools = tools ?? getBuiltInToolDefinitions();
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
    const rolePrompt: LLMMessage[] = [
      {
        role: 'system',
        content: systemPrompt ? `${systemPrompt}\n\n${systemContent}` : systemContent
      },
      {
        role: 'user',
        content: `User task: ${message}\n\nMemory context:\n${memoryContext}\n\nPrevious agent output:\n${episode.join('\n')}\n\nRespond with your assigned role output.`
      }
    ];

    const roleResult = await executeLLMToolLoop({
      provider: providerOverride,
      model: modelOverride ?? 'gpt-4o-mini',
      messages: rolePrompt,
      tools: availableTools,
      runId,
      organizationId,
      ownerUserId,
      maxToolRounds: 2,
      onToolExecuted(record) {
        steps.push({
          name: `tool:${record.call.name}`,
          latency: record.latency_ms,
          input: record.call.arguments,
          output: record.result
        });
      }
    });

    const finalOutput = roleResult.content;
    toolsCalled.push(...roleResult.toolsCalled);
    modelIterations += roleResult.modelIterations;
    totalPromptTokens += roleResult.prompt_tokens;
    totalCompletionTokens += roleResult.completion_tokens;
    totalTokens += roleResult.total_tokens;
    totalEstimatedCost += roleResult.estimated_cost;
    totalLatencyMs += roleResult.latency_ms;
    lastProviderName = roleResult.provider_name ?? lastProviderName;
    lastModelName = roleResult.model_name ?? lastModelName;

    steps.push({
      name: role,
      latency: roleResult.latency_ms,
      input: undefined,
      output: finalOutput
    });

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
