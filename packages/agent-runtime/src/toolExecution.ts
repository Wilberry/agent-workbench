import { chatCompletion, streamChatCompletion } from './llm/client';
import { collectLLMStream } from './llm/stream';
import type {
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMToolCall,
  LLMToolDefinition
} from './llm/types';
import { throwIfAborted } from './cancellation';
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

export class LLMToolExecutionError extends Error {
  code = 'LLM_TOOL_EXECUTION_FAILED';

  constructor(
    public readonly toolName: string,
    public readonly completedToolCalls: number,
    cause: unknown
  ) {
    super(
      `Tool execution failed for ${toolName}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
    this.name = 'LLMToolExecutionError';
  }
}

export type LLMToolLoopCheckpoint = {
  version: 1;
  provider: string;
  model: string;
  messages: LLMMessage[];
  toolRounds: number;
  toolsCalled: string[];
  completedToolCalls: number;
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

export class LLMToolContinuationError extends Error {
  code = 'LLM_TOOL_CONTINUATION_FAILED';

  constructor(
    public readonly completedToolCalls: number,
    cause: unknown,
    public readonly resumeSafe = false,
    public readonly checkpoint?: LLMToolLoopCheckpoint
  ) {
    super(
      `Provider continuation failed after ${completedToolCalls} completed tool call(s): ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
    this.name = 'LLMToolContinuationError';
  }
}

export class LLMToolCheckpointError extends Error {
  code = 'LLM_TOOL_CHECKPOINT_FAILED';

  constructor(
    public readonly completedToolCalls: number,
    cause: unknown
  ) {
    super(
      `Tool continuation checkpoint failed after ${completedToolCalls} completed tool call(s): ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
    this.name = 'LLMToolCheckpointError';
  }
}

export type ToolExecutionRecord = {
  call: LLMToolCall;
  result: unknown;
  latency_ms: number;
  mode: 'native' | 'legacy';
};

export type LLMToolLoopAggregate = {
  modelIterations: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  latency_ms: number;
  provider_name?: string;
  model_name?: string;
  stop_reason?: LLMResponse['stop_reason'];
};

export type LLMToolLoopResult = LLMToolLoopAggregate & {
  content: string;
  toolsCalled: string[];
  toolExecutions: ToolExecutionRecord[];
  legacyFallbackUsed: boolean;
};

export type LLMToolLoopStreamContext = {
  modelIteration: number;
};

type Complete = (request: LLMRequest) => Promise<LLMResponse>;
type Stream = (request: LLMRequest) => AsyncIterable<LLMStreamEvent>;
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
  signal?: AbortSignal;
  resumeFrom?: LLMToolLoopCheckpoint | null;
  assertActive?: () => void | Promise<void>;
  onModelResponse?: (
    response: LLMResponse,
    aggregate: LLMToolLoopAggregate
  ) => void | Promise<void>;
  onStreamEvent?: (
    event: LLMStreamEvent,
    context: LLMToolLoopStreamContext
  ) => void | Promise<void>;
  onToolExecuted?: (record: ToolExecutionRecord) => void | Promise<void>;
  onCheckpoint?: (checkpoint: LLMToolLoopCheckpoint) => void | Promise<void>;
  complete?: Complete;
  stream?: Stream;
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

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

function validateCheckpoint(
  checkpoint: LLMToolLoopCheckpoint | null | undefined,
  provider: string,
  model: string
): void {
  if (!checkpoint) return;
  if (checkpoint.version !== 1) {
    throw new Error(`Unsupported tool-loop checkpoint version: ${checkpoint.version}`);
  }
  if (normalizedName(checkpoint.provider) !== normalizedName(provider) || checkpoint.model !== model) {
    throw new Error('Tool-loop checkpoint provider/model does not match the requested execution');
  }
}

function copyMessages(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((message) => ({
    ...message,
    tool_calls: message.tool_calls?.map((call) => ({
      ...call,
      arguments: { ...call.arguments }
    }))
  }));
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
  signal,
  resumeFrom,
  assertActive,
  onModelResponse,
  onStreamEvent,
  onToolExecuted,
  onCheckpoint,
  complete = chatCompletion,
  stream,
  executeTool = runTool
}: ExecuteLLMToolLoopInput): Promise<LLMToolLoopResult> {
  if (!Number.isInteger(maxToolRounds) || maxToolRounds < 0) {
    throw new Error('maxToolRounds must be a non-negative integer');
  }
  validateCheckpoint(resumeFrom, provider, model);

  const allowedNames = new Set(tools.map((tool) => tool.name));
  const currentMessages: LLMMessage[] = copyMessages(resumeFrom?.messages ?? messages);
  const toolsCalled: string[] = [...(resumeFrom?.toolsCalled ?? [])];
  const toolExecutions: ToolExecutionRecord[] = [];
  const executionContext: ToolExecutionContext = {
    ownerUserId,
    agentId,
    conversationId
  };

  let modelIterations = resumeFrom?.modelIterations ?? 0;
  let toolRounds = resumeFrom?.toolRounds ?? 0;
  let completedToolCalls = resumeFrom?.completedToolCalls ?? 0;
  let promptTokens = resumeFrom?.prompt_tokens ?? 0;
  let completionTokens = resumeFrom?.completion_tokens ?? 0;
  let totalTokens = resumeFrom?.total_tokens ?? 0;
  let estimatedCost = resumeFrom?.estimated_cost ?? 0;
  let latencyMs = resumeFrom?.latency_ms ?? 0;
  let lastProviderName: string | undefined = resumeFrom?.provider_name;
  let lastModelName: string | undefined = resumeFrom?.model_name;
  let lastStopReason: LLMResponse['stop_reason'] = resumeFrom?.stop_reason;
  let legacyFallbackUsed = resumeFrom?.legacyFallbackUsed ?? false;
  let lastCheckpoint: LLMToolLoopCheckpoint | undefined = resumeFrom ?? undefined;
  let checkpointPersisted = Boolean(resumeFrom);

  const ensureActive = async () => {
    throwIfAborted(signal);
    await assertActive?.();
    throwIfAborted(signal);
  };

  const buildCheckpoint = (): LLMToolLoopCheckpoint => ({
    version: 1,
    provider: normalizedName(provider),
    model,
    messages: copyMessages(currentMessages),
    toolRounds,
    toolsCalled: [...toolsCalled],
    completedToolCalls,
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
  });

  const persistCheckpoint = async () => {
    lastCheckpoint = buildCheckpoint();
    checkpointPersisted = false;
    if (!onCheckpoint) return;
    try {
      await onCheckpoint(lastCheckpoint);
      checkpointPersisted = true;
    } catch (error) {
      throw new LLMToolCheckpointError(completedToolCalls, error);
    }
  };

  while (true) {
    await ensureActive();
    const request: LLMRequest = {
      provider,
      model,
      messages: currentMessages,
      temperature,
      max_tokens,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      signal
    };

    let response: LLMResponse;
    try {
      const streamImpl = stream ?? (onStreamEvent ? streamChatCompletion : undefined);
      if (streamImpl) {
        const iteration = modelIterations + 1;
        response = await collectLLMStream(
          streamImpl(request),
          onStreamEvent
            ? (event) => onStreamEvent(event, { modelIteration: iteration })
            : undefined
        );
      } else {
        response = await complete(request);
      }
    } catch (error) {
      if (completedToolCalls > 0) {
        throw new LLMToolContinuationError(
          completedToolCalls,
          error,
          checkpointPersisted,
          lastCheckpoint
        );
      }
      throw error;
    }

    modelIterations += 1;
    promptTokens += response.prompt_tokens;
    completionTokens += response.completion_tokens;
    totalTokens += response.total_tokens;
    estimatedCost += response.estimated_cost;
    latencyMs += response.latency_ms;
    lastProviderName = response.provider_name ?? lastProviderName ?? provider;
    lastModelName = response.model_name ?? lastModelName ?? model;
    lastStopReason = response.stop_reason;

    const aggregate: LLMToolLoopAggregate = {
      modelIterations,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      latency_ms: latencyMs,
      provider_name: lastProviderName,
      model_name: lastModelName,
      stop_reason: lastStopReason
    };
    await onModelResponse?.(response, aggregate);

    const nativeCalls = response.tool_calls ?? [];
    if (nativeCalls.length > 0) {
      if (toolRounds >= maxToolRounds) {
        throw new LLMToolLoopLimitError(maxToolRounds);
      }

      for (const call of nativeCalls) {
        assertAllowedTool(call.name, allowedNames);
      }

      const roundResults: ToolExecutionRecord[] = [];
      for (const call of nativeCalls) {
        await ensureActive();
        const startedAt = Date.now();
        let result: unknown;
        try {
          result = await executeTool(
            call.name,
            call.arguments,
            runId,
            organizationId,
            executionContext
          );
        } catch (error) {
          throw new LLMToolExecutionError(call.name, completedToolCalls, error);
        }
        const record: ToolExecutionRecord = {
          call,
          result,
          latency_ms: Date.now() - startedAt,
          mode: 'native'
        };
        completedToolCalls += 1;
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
      await ensureActive();
      await persistCheckpoint();
      continue;
    }

    const legacyCall = parseLegacyToolCall(response.content);
    if (legacyCall) {
      if (toolRounds >= maxToolRounds) {
        throw new LLMToolLoopLimitError(maxToolRounds);
      }

      assertAllowedTool(legacyCall.name, allowedNames);
      await ensureActive();
      legacyFallbackUsed = true;
      const syntheticCall: LLMToolCall = {
        id: `legacy-${modelIterations}-${toolRounds + 1}`,
        name: legacyCall.name,
        arguments: legacyCall.args
      };
      const startedAt = Date.now();
      let result: unknown;
      try {
        result = await executeTool(
          legacyCall.name,
          legacyCall.args,
          runId,
          organizationId,
          executionContext
        );
      } catch (error) {
        throw new LLMToolExecutionError(legacyCall.name, completedToolCalls, error);
      }
      const record: ToolExecutionRecord = {
        call: syntheticCall,
        result,
        latency_ms: Date.now() - startedAt,
        mode: 'legacy'
      };
      completedToolCalls += 1;
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
      await ensureActive();
      await persistCheckpoint();
      continue;
    }

    return {
      content: response.content,
      toolsCalled,
      toolExecutions,
      ...aggregate,
      legacyFallbackUsed
    };
  }
}
