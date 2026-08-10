import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  LLMUsage
} from '../types';
import { getPricingProvider, UnknownModelPricingError } from '../pricing';
import { requestWithProviderReliability } from '../http';
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

function normalizeStopReason(payload: any): LLMResponse['stop_reason'] {
  if (payload?.stop_reason === 'tool_use') return 'tool_use';
  if (payload?.stop_reason === 'max_tokens') return 'max_tokens';
  if (payload?.stop_reason === 'end_turn' || payload?.stop_reason === 'stop_sequence') return 'stop';
  return typeof payload?.stop_reason === 'string' ? payload.stop_reason : undefined;
}

function serializeToolChoice(toolChoice: LLMRequest['tool_choice']) {
  if (toolChoice === 'required') return { type: 'any' };
  if (toolChoice === 'none') return { type: 'none' };
  return { type: 'auto' };
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

    const normalized = serializeMessages(request.messages);
    const hasTools = Boolean(request.tools?.length);
    const body = {
      model: request.model,
      max_tokens: request.max_tokens ?? 1200,
      ...(normalized.system ? { system: normalized.system } : {}),
      messages: normalized.messages,
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

    const start = Date.now();
    const response = await requestWithProviderReliability(
      'anthropic',
      ANTHROPIC_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION
        },
        body: JSON.stringify(body)
      },
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
  }
};
