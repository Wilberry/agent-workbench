import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  LLMUsage
} from '../types';
import { getPricingProvider } from '../pricing';
import { requestWithProviderReliability } from '../http';
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

function normalizeStopReason(payload: any): LLMResponse['stop_reason'] {
  const finishReason = payload?.choices?.[0]?.finish_reason;
  if (finishReason === 'tool_calls' || finishReason === 'function_call') return 'tool_use';
  if (finishReason === 'length') return 'max_tokens';
  if (finishReason === 'content_filter') return 'content_filter';
  if (finishReason === 'stop') return 'stop';
  return typeof finishReason === 'string' ? finishReason : undefined;
}

export const openaiProvider: LLMProvider = {
  name: 'openai',
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    const hasTools = Boolean(request.tools?.length);
    const body = {
      model: request.model,
      messages: request.messages.map(serializeMessage),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 1200,
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

    const start = Date.now();
    const res = await requestWithProviderReliability(
      'openai',
      OPENAI_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      },
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
  }
};
