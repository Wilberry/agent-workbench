import { chatCompletion } from './llm/client';
import type {
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition
} from './llm/types';
import { runTool, type ToolExecutionContext } from './tools';

export class LLMToolNotAllowedError extends Error {
  code = 'LLM_TOOL_NOT_ALLOWED';

  constructor(public readonly toolName: string) {
    super(`Tool is not allowed for this agent version: ${toolName}`);
    this.name = 'LLMToolNotAllowedError';
  }
}

export class LLMToolLoopLimitError extends Error {
  code = 'LLM_TOOL_LOOP_LIMIT';

  constructor(public readonly maxToolRounds: number) {
    super(`Tool execution exceeded the configured limit of ${maxToolRounds} round(s)`);
    this.name = 'LLMToolLoopLimitError';
  }
}

export type ToolExecutionRecord = {
  call: LLMToolCall;
  result: unknown;
  latency_ms: number;
  mode: 'native' | 'legacy';
};

export type LLMToolLoopResult = {
  content: string;
  toolsCalled: string[];
  toolExecutions: ToolExecutionRecord[];
  modelIterations: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  latency_ms: number;
  provider_name?: string;
  model_name?: string;
  stop_reason?: LLMResponse['stop_reason'];
  legacyFallbackUsed: boolean;
};

type Complete = (request: LLMRequest) => Promise<LLMResponse>;
type ExecuteTool = (
  name: string,
  args: Record<string, unknown>,
  runId?: string,
  organizationId?: string | null,
  context?: ToolExecutionContext
) => Promise<unknown>;

type ExecuteLLMToolLoopInput = {
  provider: string;
  model: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  runId?: string;
  organizationId?: string | null;
  ownerUserId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
  temperature?: number;
  max_tokens?: number;
  maxToolRounds?: number;
  onToolExecuted?: (record: ToolExecutionRecord) => void | Promise<void>;
  complete?: Complete;
  executeTool?: ExecuteTool;
};

type LegacyToolCall = {
  name: string;
  args: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseLegacyToolCall(text: string): LegacyToolCall | null {
  const match = text.match(/TOOL_CALL:\s*({[\s\S]*})/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed?.name !== 'string' || !isRecord(parsed?.args)) return null;
    return { name: parsed.name, args: parsed.args };
  } catch {
    return null;
  }
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function assertAllowedTool(toolName: string, allowedNames: Set<string>) {
  if (!allowedNames.has(toolName)) {
    throw new LLMToolNotAllowedError(toolName);
  }
}

export async function executeLLMToolLoop({
  provider,
  model,
  messages,
  tools,
  runId,
  organizationId,
  ownerUserId,
  agentId,
  conversationId,
  temperature = 0.7,
  max_tokens = 1200,
  maxToolRounds = 2,
  onToolExecuted,
  complete = chatCompletion,
  executeTool = runTool
}: ExecuteLLMToolLoopInput): Promise<LLMToolLoopResult> {
  if (!Number.isInteger(maxToolRounds) || maxToolRounds < 0) {
    throw new Error('maxToolRounds must be a non-negative integer');
  }

  const allowedNames = new Set(tools.map((tool) => tool.name));
  const currentMessages: LLMMessage[] = [...messages];
  const toolsCalled: string[] = [];
  const toolExecutions: ToolExecutionRecord[] = [];
  const executionContext: ToolExecutionContext = {
    ownerUserId,
    agentId,
    conversationId
  };

  let modelIterations = 0;
  let toolRounds = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let estimatedCost = 0;
  let latencyMs = 0;
  let lastProviderName: string | undefined;
  let lastModelName: string | undefined;
  let lastStopReason: LLMResponse['stop_reason'];
  let legacyFallbackUsed = false;

  while (true) {
    const response = await complete({
      provider,
      model,
      messages: currentMessages,
      temperature,
      max_tokens,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined
    });

    modelIterations += 1;
    promptTokens += response.prompt_tokens;
    completionTokens += response.completion_tokens;
    totalTokens += response.total_tokens;
    estimatedCost += response.estimated_cost;
    latencyMs += response.latency_ms;
    lastProviderName = response.provider_name ?? lastProviderName ?? provider;
    lastModelName = response.model_name ?? lastModelName ?? model;
    lastStopReason = response.stop_reason;

    const nativeCalls = response.tool_calls ?? [];
    if (nativeCalls.length > 0) {
      if (toolRounds >= maxToolRounds) {
        throw new LLMToolLoopLimitError(maxToolRounds);
      }

      // Validate the whole provider response before causing any tool side effects.
      for (const call of nativeCalls) {
        assertAllowedTool(call.name, allowedNames);
      }

      const roundResults: ToolExecutionRecord[] = [];
      for (const call of nativeCalls) {
        const startedAt = Date.now();
        const result = await executeTool(
          call.name,
          call.arguments,
          runId,
          organizationId,
          executionContext
        );
        const record: ToolExecutionRecord = {
          call,
          result,
          latency_ms: Date.now() - startedAt,
          mode: 'native'
        };
        toolsCalled.push(call.name);
        toolExecutions.push(record);
        roundResults.push(record);
        await onToolExecuted?.(record);
      }

      currentMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: nativeCalls
      });
      for (const record of roundResults) {
        currentMessages.push({
          role: 'tool',
          tool_call_id: record.call.id,
          name: record.call.name,
          content: stringifyToolResult(record.result)
        });
      }

      toolRounds += 1;
      continue;
    }

    const legacyCall = parseLegacyToolCall(response.content);
    if (legacyCall) {
      if (toolRounds >= maxToolRounds) {
        throw new LLMToolLoopLimitError(maxToolRounds);
      }

      assertAllowedTool(legacyCall.name, allowedNames);
      legacyFallbackUsed = true;
      const syntheticCall: LLMToolCall = {
        id: `legacy-${modelIterations}-${toolRounds + 1}`,
        name: legacyCall.name,
        arguments: legacyCall.args
      };
      const startedAt = Date.now();
      const result = await executeTool(
        legacyCall.name,
        legacyCall.args,
        runId,
        organizationId,
        executionContext
      );
      const record: ToolExecutionRecord = {
        call: syntheticCall,
        result,
        latency_ms: Date.now() - startedAt,
        mode: 'legacy'
      };
      toolsCalled.push(legacyCall.name);
      toolExecutions.push(record);
      await onToolExecuted?.(record);

      currentMessages.push({ role: 'assistant', content: response.content });
      currentMessages.push({
        role: 'system',
        content: `Tool ${legacyCall.name} executed. Result:\n${stringifyToolResult(result)}`
      });
      currentMessages.push({
        role: 'user',
        content: 'Continue the response using the tool result above.'
      });

      toolRounds += 1;
      continue;
    }

    return {
      content: response.content,
      toolsCalled,
      toolExecutions,
      modelIterations,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      latency_ms: latencyMs,
      provider_name: lastProviderName,
      model_name: lastModelName,
      stop_reason: lastStopReason,
      legacyFallbackUsed
    };
  }
}
