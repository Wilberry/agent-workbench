import { openaiProvider } from './providers/openai';
import { mockProvider } from './providers/mock';
import type { LLMRequest, LLMResponse, LLMProvider } from './types';

const providers: Record<string, LLMProvider> = {
  openai: openaiProvider,
  mock: mockProvider
};

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
  const name = provider?.trim().toLowerCase() || 'openai';
  const selectedProvider = providers[name];

  if (!selectedProvider) {
    throw new UnsupportedLLMProviderError(name);
  }

  if (name === 'openai') {
    if (process.env.USE_MOCK_OPENAI === 'true') {
      return mockProvider;
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new LLMConfigurationError(
        'OPENAI_API_KEY is required for the OpenAI provider unless USE_MOCK_OPENAI=true is explicitly set.'
      );
    }
  }

  return selectedProvider;
}

export async function chatCompletion(request: LLMRequest): Promise<LLMResponse> {
  const provider = getProvider(request.provider);
  return provider.chatCompletion(request);
}
