import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent
} from './types';
import { LLMStreamProtocolError } from './stream';
import {
  getLLMProviderRegistration,
  normalizeProviderName
} from './registry';
import { mockProvider } from './providers/mock';

export class LLMConfigurationError extends Error {
  code = 'LLM_CONFIGURATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'LLMConfigurationError';
  }
}

export class UnsupportedLLMProviderError extends Error {
  code = 'UNSUPPORTED_LLM_PROVIDER';

  constructor(public readonly provider: string) {
    super(`Unsupported LLM provider: ${provider}`);
    this.name = 'UnsupportedLLMProviderError';
  }
}

function getProvider(provider?: string): LLMProvider {
  const name = normalizeProviderName(provider);

  if (name === 'openai' && process.env.USE_MOCK_OPENAI === 'true') {
    return mockProvider;
  }

  const registration = getLLMProviderRegistration(name);
  if (!registration) {
    throw new UnsupportedLLMProviderError(name);
  }

  const missingEnv = registration.requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    if (name === 'openai' && missingEnv.includes('OPENAI_API_KEY')) {
      throw new LLMConfigurationError(
        'OPENAI_API_KEY is required for the OpenAI provider unless USE_MOCK_OPENAI=true is explicitly set.'
      );
    }

    throw new LLMConfigurationError(
      `${missingEnv.join(', ')} ${missingEnv.length === 1 ? 'is' : 'are'} required for the ${name} provider.`
    );
  }

  return registration.provider;
}

function normalizedRequest(request: LLMRequest): LLMRequest {
  return {
    ...request,
    provider: normalizeProviderName(request.provider)
  };
}

export async function chatCompletion(request: LLMRequest): Promise<LLMResponse> {
  const provider = getProvider(request.provider);
  const response = await provider.chatCompletion(normalizedRequest(request));

  return {
    ...response,
    provider_name: response.provider_name ?? normalizeProviderName(provider.name)
  };
}

export async function* streamChatCompletion(
  request: LLMRequest
): AsyncIterable<LLMStreamEvent> {
  const provider = getProvider(request.provider);
  const providerName = normalizeProviderName(provider.name);
  const normalized = normalizedRequest(request);

  if (provider.streamChatCompletion) {
    let completed = false;
    for await (const event of provider.streamChatCompletion(normalized)) {
      if (event.type === 'response_start') {
        yield {
          ...event,
          provider_name: event.provider_name || providerName
        };
        continue;
      }

      if (event.type === 'response_end') {
        completed = true;
        yield {
          ...event,
          response: {
            ...event.response,
            provider_name: event.response.provider_name ?? providerName
          }
        };
        continue;
      }

      yield event;
    }

    if (!completed) {
      throw new LLMStreamProtocolError(
        providerName,
        'provider stream ended without response_end'
      );
    }
    return;
  }

  // Providers without native streaming stay source-compatible. They emit one
  // normalized text/tool burst around the existing buffered response.
  const response = await provider.chatCompletion(normalized);
  const finalResponse: LLMResponse = {
    ...response,
    provider_name: response.provider_name ?? providerName
  };

  yield {
    type: 'response_start',
    provider_name: finalResponse.provider_name ?? providerName,
    model_name: finalResponse.model_name
  };

  if (finalResponse.content) {
    yield { type: 'text_delta', delta: finalResponse.content };
  }

  for (const [index, call] of (finalResponse.tool_calls ?? []).entries()) {
    yield {
      type: 'tool_call_start',
      index,
      id: call.id,
      name: call.name
    };
    yield { type: 'tool_call_end', index, call };
  }

  yield {
    type: 'usage',
    usage: {
      prompt_tokens: finalResponse.prompt_tokens,
      completion_tokens: finalResponse.completion_tokens,
      total_tokens: finalResponse.total_tokens
    },
    estimated_cost: finalResponse.estimated_cost
  };
  yield { type: 'response_end', response: finalResponse };
}
