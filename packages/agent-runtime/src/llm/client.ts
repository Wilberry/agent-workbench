import type { LLMRequest, LLMResponse, LLMProvider } from './types';
import {
  getLLMProviderRegistration,
  listLLMProviders,
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
    throw new LLMConfigurationError(
      `${missingEnv.join(', ')} ${missingEnv.length === 1 ? 'is' : 'are'} required for the ${name} provider.`
    );
  }

  return registration.provider;
}

export async function chatCompletion(request: LLMRequest): Promise<LLMResponse> {
  const provider = getProvider(request.provider);
  return provider.chatCompletion({
    ...request,
    provider: normalizeProviderName(request.provider)
  });
}

export { listLLMProviders };
