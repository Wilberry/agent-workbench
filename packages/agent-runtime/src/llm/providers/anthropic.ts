import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMToolCall,
  LLMUsage
} from '../types';
import { getPricingProvider, UnknownModelPricingError } from '../pricing';
import { requestWithProviderReliability } from '../http';
import { streamProviderResponseWithReliability } from '../httpStream';
import { SSEDataParser } from '../sse';
import { LLMStreamProtocolError } from '../stream';
import { normalizeToolCall } from '../tooling';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

type AnthropicTextBlock = { type: 'text'; text: string };
type AnthropicToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;
type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicToolAccumulator = {
  index: number;
  id: string;
  name: string;
  argumentsText: string;
  completed: boolean;
};

function serializeMessages(messages: LLMMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const conversationalMessages: AnthropicMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    const role = message.role.trim().toLowerCase();

    if (role === 'system') {
      if (message.content.trim()) systemParts.push(message.content);
      continue;
    }

    if (role === 'tool') {
      const toolResults: AnthropicToolResultBlock[] = [];
      let toolIndex = index;

      while (toolIndex < messages.length && messages[toolIndex]?.role.trim().toLowerCase() === 'tool') {
        const toolMessage = messages[toolIndex]!;
        if (!toolMessage.tool_call_id) {
          throw new Error('Anthropic tool result messages require tool_call_id');
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolMessage.tool_call_id,
          content: toolMessage.content,
          ...(toolMessage.is_error ? { is_error: true } : {})
        });
        toolIndex += 1;
      }

      conversationalMessages.push({ role: 'user', content: toolResults });
      index = toolIndex - 1;
      continue;
    }

    if (role !== 'user' && role !== 'assistant') {
      throw new Error(`Anthropic provider does not support message role: ${message.role}`);
    }

    if (role === 'assistant' && message.tool_calls?.length) {
      const content: AnthropicContentBlock[] = [];
      if (message.content.trim()) {
        content.push({ type: 'text', text: message.content });
      }
      content.push(
        ...message.tool_calls.map((toolCall) => ({
          type: 'tool_use' as const,
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.arguments
        }))
      );
      conversationalMessages.push({ role: 'assistant', content });
      continue;
    }

    conversationalMessages.push({
      role,
      content: message.content
    });
  }

  if (conversationalMessages.length === 0) {
    throw new Error('Anthropic provider requires at least one user or assistant message');
  }

  if (conversationalMessages[conversationalMessages.length - 1]?.role === 'assistant') {
    throw new Error('Anthropic provider requires the final conversational message to have role user');
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: conversationalMessages
  };
}

function normalizeUsage(payload: any): LLMUsage {
  const promptTokens = Number(payload?.usage?.input_tokens ?? 0);
  const completionTokens = Number(payload?.usage?.output_tokens ?? 0);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  };
}

function extractTextContent(payload: any): string {
  if (!Array.isArray(payload?.content)) return '';

  return payload.content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => block.text)
    .join('\n');
}

function extractToolCalls(payload: any): LLMToolCall[] {
  if (!Array.isArray(payload?.content)) return [];

  return payload.content
    .filter((block: any) => block?.type === 'tool_use')
    .map((block: any) =>
      normalizeToolCall({
        provider: 'anthropic',
        id: String(block?.id ?? ''),
        name: String(block?.name ?? ''),
        arguments: block?.input ?? {}
      })
    );
}

function normalizeAnthropicStopReason(stopReason: unknown): LLMResponse['stop_reason'] {
  if (stopReason === 'tool_use') return 'tool_use';
  if (stopReason === 'max_tokens') return 'max_tokens';
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') return 'stop';
  return typeof stopReason === 'string' ? stopReason : undefined;
}

function normalizeStopReason(payload: any): LLMResponse['stop_reason'] {
  return normalizeAnthropicStopReason(payload?.stop_reason);
}

function serializeToolChoice(toolChoice: LLMRequest['tool_choice']) {
  if (toolChoice === 'required') return { type: 'any' };
  if (toolChoice === 'none') return { type: 'none' };
  return { type: 'auto' };
}

function createRequestBody(request: LLMRequest, stream = false): Record<string, unknown> {
  const normalized = serializeMessages(request.messages);
  const hasTools = Boolean(request.tools?.length);
  return {
    model: request.model,
    max_tokens: request.max_tokens ?? 1200,
    ...(normalized.system ? { system: normalized.system } : {}),
    messages: normalized.messages,
    ...(stream ? { stream: true } : {}),
    ...(hasTools
      ? {
          tools: request.tools!.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
          })),
          tool_choice: serializeToolChoice(request.tool_choice)
        }
      : {})
  };
}

function requestInit(apiKey: string, request: LLMRequest, stream = false): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION
    },
    body: JSON.stringify(createRequestBody(request, stream))
  };
}

export const anthropicProvider: LLMProvider = {
  name: 'anthropic',
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    const pricingProvider = getPricingProvider();
    if (!pricingProvider.getModelPricing(request.model, 'anthropic')) {
      throw new UnknownModelPricingError(request.model, 'anthropic');
    }

    const start = Date.now();
    const response = await requestWithProviderReliability(
      'anthropic',
      ANTHROPIC_URL,
      requestInit(apiKey, request),
      {
        timeoutMs: request.timeout_ms,
        maxRetries: request.max_retries
      }
    );
    const latency_ms = Date.now() - start;

    const payload = JSON.parse(response.body);
    const usage = normalizeUsage(payload);
    const toolCalls = extractToolCalls(payload);
    const modelName = payload?.model ?? request.model;
    const estimated_cost = pricingProvider.estimateCost(modelName, usage, 'anthropic');

    return {
      content: extractTextContent(payload),
      provider_name: 'anthropic',
      model_name: modelName,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms,
      estimated_cost,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      stop_reason: normalizeStopReason(payload),
      raw: payload
    };
  },

  async *streamChatCompletion(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    const pricingProvider = getPricingProvider();
    if (!pricingProvider.getModelPricing(request.model, 'anthropic')) {
      throw new UnknownModelPricingError(request.model, 'anthropic');
    }

    const parser = new SSEDataParser();
    const toolAccumulators = new Map<number, AnthropicToolAccumulator>();
    const toolCalls = new Map<number, LLMToolCall>();
    const start = Date.now();
    let started = false;
    let terminalReceived = false;
    let content = '';
    let textBlocksSeen = 0;
    let modelName = request.model;
    let promptTokens = 0;
    let completionTokens = 0;
    let stopReason: LLMResponse['stop_reason'];

    const processPayload = function* (payloadText: string): Generator<LLMStreamEvent> {
      if (!payloadText) return;
      const payload = JSON.parse(payloadText);
      const eventType = payload?.type;

      if (eventType === 'error') {
        throw new LLMStreamProtocolError(
          'anthropic',
          typeof payload?.error?.message === 'string'
            ? payload.error.message
            : 'provider emitted an error event'
        );
      }

      if (eventType === 'message_stop') {
        terminalReceived = true;
        return;
      }

      if (eventType === 'message_start') {
        modelName = typeof payload?.message?.model === 'string' ? payload.message.model : modelName;
        promptTokens = Number(payload?.message?.usage?.input_tokens ?? promptTokens);
        if (!started) {
          started = true;
          yield { type: 'response_start', provider_name: 'anthropic', model_name: modelName };
        }
        return;
      }

      if (!started) {
        started = true;
        yield { type: 'response_start', provider_name: 'anthropic', model_name: modelName };
      }

      if (eventType === 'content_block_start') {
        const index = Number(payload?.index ?? 0);
        const block = payload?.content_block;
        if (block?.type === 'text') {
          if (textBlocksSeen > 0) {
            content += '\n';
            yield { type: 'text_delta', delta: '\n' };
          }
          textBlocksSeen += 1;
          if (typeof block?.text === 'string' && block.text) {
            content += block.text;
            yield { type: 'text_delta', delta: block.text };
          }
          return;
        }

        if (block?.type === 'tool_use') {
          const blockInput = block?.input;
          const hasInitialInput = Boolean(
            blockInput &&
            typeof blockInput === 'object' &&
            !Array.isArray(blockInput) &&
            Object.keys(blockInput).length > 0
          );
          const accumulator: AnthropicToolAccumulator = {
            index,
            id: String(block?.id ?? ''),
            name: String(block?.name ?? ''),
            argumentsText: hasInitialInput ? JSON.stringify(blockInput) : '',
            completed: false
          };
          toolAccumulators.set(index, accumulator);
          yield {
            type: 'tool_call_start',
            index,
            id: accumulator.id,
            name: accumulator.name
          };
        }
        return;
      }

      if (eventType === 'content_block_delta') {
        const index = Number(payload?.index ?? 0);
        const delta = payload?.delta;
        if (delta?.type === 'text_delta' && typeof delta?.text === 'string') {
          content += delta.text;
          yield { type: 'text_delta', delta: delta.text };
          return;
        }

        if (delta?.type === 'input_json_delta' && typeof delta?.partial_json === 'string') {
          const accumulator = toolAccumulators.get(index);
          if (!accumulator) {
            throw new LLMStreamProtocolError(
              'anthropic',
              `tool arguments arrived before tool start at index ${index}`
            );
          }
          accumulator.argumentsText += delta.partial_json;
          yield {
            type: 'tool_call_delta',
            index,
            id: accumulator.id,
            arguments_delta: delta.partial_json
          };
        }
        return;
      }

      if (eventType === 'content_block_stop') {
        const index = Number(payload?.index ?? 0);
        const accumulator = toolAccumulators.get(index);
        if (!accumulator || accumulator.completed) return;

        const call = normalizeToolCall({
          provider: 'anthropic',
          id: accumulator.id,
          name: accumulator.name,
          arguments: accumulator.argumentsText || '{}'
        });
        accumulator.completed = true;
        toolCalls.set(index, call);
        yield { type: 'tool_call_end', index, call };
        return;
      }

      if (eventType === 'message_delta') {
        stopReason = normalizeAnthropicStopReason(payload?.delta?.stop_reason) ?? stopReason;
        if (payload?.usage?.output_tokens !== undefined) {
          completionTokens = Number(payload.usage.output_tokens ?? completionTokens);
        }
      }
    };

    for await (const chunk of streamProviderResponseWithReliability(
      'anthropic',
      ANTHROPIC_URL,
      requestInit(apiKey, request, true),
      {
        timeoutMs: request.timeout_ms,
        maxRetries: request.max_retries
      }
    )) {
      for (const payloadText of parser.push(chunk)) {
        yield* processPayload(payloadText);
      }
    }

    for (const payloadText of parser.finish()) {
      yield* processPayload(payloadText);
    }

    if (!terminalReceived) {
      throw new LLMStreamProtocolError('anthropic', 'stream ended before message_stop');
    }

    if (!started) {
      yield { type: 'response_start', provider_name: 'anthropic', model_name: modelName };
    }

    for (const accumulator of Array.from(toolAccumulators.values()).sort((a, b) => a.index - b.index)) {
      if (accumulator.completed) continue;
      const call = normalizeToolCall({
        provider: 'anthropic',
        id: accumulator.id,
        name: accumulator.name,
        arguments: accumulator.argumentsText || '{}'
      });
      toolCalls.set(accumulator.index, call);
      yield { type: 'tool_call_end', index: accumulator.index, call };
    }

    const usage: LLMUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    };
    const estimated_cost = pricingProvider.estimateCost(modelName, usage, 'anthropic');
    yield { type: 'usage', usage, estimated_cost };

    const orderedToolCalls = Array.from(toolCalls.entries())
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call);
    const response: LLMResponse = {
      content,
      provider_name: 'anthropic',
      model_name: modelName,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms: Date.now() - start,
      estimated_cost,
      tool_calls: orderedToolCalls.length > 0 ? orderedToolCalls : undefined,
      stop_reason: stopReason,
      raw: { streamed: true }
    };

    yield { type: 'response_end', response };
  }
};
