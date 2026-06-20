import { openaiProvider } from './providers/openai';
import { mockProvider } from './providers/mock';
import type { LLMRequest, LLMResponse, LLMProvider } from './types';

const providers: Record<string, LLMProvider> = {
  openai: openaiProvider,
  mock: mockProvider
};

function getProvider(provider?: string): LLMProvider {
  const useMockOpenAI = process.env.USE_MOCK_OPENAI === 'true' || !process.env.OPENAI_API_KEY;
  if (useMockOpenAI) {
    return mockProvider;
  }

  const name = provider?.toLowerCase() ?? 'openai';
  return providers[name] ?? openaiProvider;
}

export async function chatCompletion(request: LLMRequest): Promise<LLMResponse> {
  const provider = getProvider(request.provider);
  return provider.chatCompletion(request);
}
