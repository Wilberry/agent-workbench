import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMToolCall,
  LLMUsage
} from '../types';
import { getPricingProvider } from '../pricing';
import { requestWithProviderReliability } from '../http';
import { streamProviderResponseWithReliability } from '../httpStream';
import { SSEDataParser } from '../sse';
import { LLMStreamProtocolError } from '../stream';
import { normalizeToolCall } from '../tooling';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function normalizeUsage(payload: any): LLMUsage {
  return {
    prompt_tokens: Number(payload?.usage?.prompt_tokens ?? 0),
    completion_tokens: Number(payload?.usage?.completion_tokens ?? 0),
    total_tokens: Number(payload?.usage?.total_tokens ?? 0)
  };
}

function serializeMessage(message: LLMMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    if (!message.tool_call_id) {
      throw new Error('OpenAI tool result messages require tool_call_id');
    }
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.tool_call_id
    };
  }

  if (message.role === 'assistant' && message.tool_calls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.tool_calls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments)
        }
      }))
    };
  }

  return {
    role: message.role,
    content: message.content
  };
}

function createRequestBody(request: LLMRequest, stream = false): Record<string, unknown> {
  const hasTools = Boolean(request.tools?.length);
  return {
    model: request.model,
    messages: request.messages.map(serializeMessage),
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? 1200,
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...(hasTools
      ? {
          tools: request.tools!.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema
            }
          })),
          tool_choice: request.tool_choice ?? 'auto'
        }
      : {})
  };
}

function requestInit(apiKey: string, request: LLMRequest, stream = false): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(createRequestBody(request, stream))
  };
}

function extractContent(payload: any): string {
  return typeof payload?.choices?.[0]?.message?.content === 'string'
    ? payload.choices[0].message.content
    : '';
}

function extractToolCalls(payload: any): LLMToolCall[] {
  const rawCalls = payload?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(rawCalls)) return [];

  return rawCalls
    .filter((call: any) => call?.type === 'function')
    .map((call: any) =>
      normalizeToolCall({
        provider: 'openai',
        id: String(call?.id ?? ''),
        name: String(call?.function?.name ?? ''),
        arguments: call?.function?.arguments ?? '{}'
      })
    );
}

function normalizeFinishReason(finishReason: unknown): LLMResponse['stop_reason'] {
  if (finishReason === 'tool_calls' || finishReason === 'function_call') return 'tool_use';
  if (finishReason === 'length') return 'max_tokens';
  if (finishReason === 'content_filter') return 'content_filter';
  if (finishReason === 'stop') return 'stop';
  return typeof finishReason === 'string' ? finishReason : undefined;
}

function normalizeStopReason(payload: any): LLMResponse['stop_reason'] {
  return normalizeFinishReason(payload?.choices?.[0]?.finish_reason);
}

type OpenAIToolAccumulator = {
  index: number;
  id: string;
  name: string;
  argumentsText: string;
  started: boolean;
};

export const openaiProvider: LLMProvider = {
  name: 'openai',
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    const start = Date.now();
    const res = await requestWithProviderReliability(
      'openai',
      OPENAI_URL,
      requestInit(apiKey, request),
      {
        timeoutMs: request.timeout_ms,
        maxRetries: request.max_retries
      }
    );

    const latency_ms = Date.now() - start;
    const payload = JSON.parse(res.body);
    const usage = normalizeUsage(payload);
    const content = extractContent(payload);
    const toolCalls = extractToolCalls(payload);
    const pricingProvider = getPricingProvider();
    const modelName = payload?.model ?? request.model;
    const estimated_cost = pricingProvider.estimateCost(modelName, usage, 'openai');

    return {
      content,
      provider_name: 'openai',
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    const parser = new SSEDataParser();
    const pricingProvider = getPricingProvider();
    const tools = new Map<number, OpenAIToolAccumulator>();
    const start = Date.now();
    let started = false;
    let terminalReceived = false;
    let content = '';
    let modelName = request.model;
    let usage: LLMUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let stopReason: LLMResponse['stop_reason'];

    const processPayload = function* (payloadText: string): Generator<LLMStreamEvent> {
      if (!payloadText) return;
      if (payloadText === '[DONE]') {
        terminalReceived = true;
        return;
      }

      const payload = JSON.parse(payloadText);
      if (payload?.error) {
        throw new LLMStreamProtocolError(
          'openai',
          typeof payload.error?.message === 'string'
            ? payload.error.message
            : 'provider emitted an error event'
        );
      }

      modelName = typeof payload?.model === 'string' ? payload.model : modelName;

      if (!started) {
        started = true;
        yield { type: 'response_start', provider_name: 'openai', model_name: modelName };
      }

      if (payload?.usage) {
        usage = normalizeUsage(payload);
      }

      const choice = payload?.choices?.[0];
      if (!choice) return;

      if (choice.finish_reason) {
        stopReason = normalizeFinishReason(choice.finish_reason);
      }

      const delta = choice.delta;
      if (typeof delta?.content === 'string' && delta.content.length > 0) {
        content += delta.content;
        yield { type: 'text_delta', delta: delta.content };
      }

      if (!Array.isArray(delta?.tool_calls)) return;

      for (const rawCall of delta.tool_calls) {
        const index = Number(rawCall?.index ?? 0);
        const current = tools.get(index) ?? {
          index,
          id: '',
          name: '',
          argumentsText: '',
          started: false
        };

        if (typeof rawCall?.id === 'string' && rawCall.id) current.id = rawCall.id;
        if (typeof rawCall?.function?.name === 'string' && rawCall.function.name) {
          current.name += rawCall.function.name;
        }

        if (!current.started && current.id && current.name) {
          current.started = true;
          yield {
            type: 'tool_call_start',
            index,
            id: current.id,
            name: current.name
          };
        }

        const argumentsDelta = typeof rawCall?.function?.arguments === 'string'
          ? rawCall.function.arguments
          : '';
        if (argumentsDelta) {
          current.argumentsText += argumentsDelta;
          if (current.id) {
            yield {
              type: 'tool_call_delta',
              index,
              id: current.id,
              arguments_delta: argumentsDelta
            };
          }
        }

        tools.set(index, current);
      }
    };

    for await (const chunk of streamProviderResponseWithReliability(
      'openai',
      OPENAI_URL,
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
      throw new LLMStreamProtocolError('openai', 'stream ended before [DONE]');
    }

    if (!started) {
      yield { type: 'response_start', provider_name: 'openai', model_name: modelName };
    }

    const toolCalls: LLMToolCall[] = [];
    for (const accumulator of Array.from(tools.values()).sort((a, b) => a.index - b.index)) {
      const call = normalizeToolCall({
        provider: 'openai',
        id: accumulator.id,
        name: accumulator.name,
        arguments: accumulator.argumentsText || '{}'
      });
      if (!accumulator.started) {
        yield {
          type: 'tool_call_start',
          index: accumulator.index,
          id: call.id,
          name: call.name
        };
      }
      toolCalls.push(call);
      yield { type: 'tool_call_end', index: accumulator.index, call };
    }

    const estimated_cost = pricingProvider.estimateCost(modelName, usage, 'openai');
    yield { type: 'usage', usage, estimated_cost };

    const response: LLMResponse = {
      content,
      provider_name: 'openai',
      model_name: modelName,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms: Date.now() - start,
      estimated_cost,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      stop_reason: stopReason,
      raw: { streamed: true }
    };

    yield { type: 'response_end', response };
  }
};
