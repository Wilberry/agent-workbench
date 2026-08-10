import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMUsage } from '../types';
import { getPricingProvider } from '../pricing';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function normalizeMessages(messages: LLMMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const conversationalMessages: AnthropicMessage[] = [];

  for (const message of messages) {
    const role = message.role.trim().toLowerCase();
    if (role === 'system') {
      if (message.content.trim()) systemParts.push(message.content);
      continue;
    }

    if (role !== 'user' && role !== 'assistant') {
      throw new Error(`Anthropic provider does not support message role: ${message.role}`);
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

export const anthropicProvider: LLMProvider = {
  name: 'anthropic',
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    const normalized = normalizeMessages(request.messages);
    const body = {
      model: request.model,
      max_tokens: request.max_tokens ?? 1200,
      ...(normalized.system ? { system: normalized.system } : {}),
      messages: normalized.messages
    };

    const start = Date.now();
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION
      },
      body: JSON.stringify(body)
    });
    const latency_ms = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${text}`);
    }

    const payload = await response.json();
    const usage = normalizeUsage(payload);
    const modelName = payload?.model ?? request.model;
    const estimated_cost = getPricingProvider().estimateCost(modelName, usage, 'anthropic');

    return {
      content: extractTextContent(payload),
      provider_name: 'anthropic',
      model_name: modelName,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms,
      estimated_cost,
      raw: payload
    };
  }
};
