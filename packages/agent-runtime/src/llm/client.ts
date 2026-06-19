import { openaiProvider } from './providers/openai';
import type { LLMRequest, LLMResponse, LLMProvider } from './types';

const providers: Record<string, LLMProvider> = {
  openai: openaiProvider
};

function getProvider(provider?: string): LLMProvider {
  const name = provider?.toLowerCase() ?? 'openai';
  return providers[name] ?? openaiProvider;
}

export async function chatCompletion(request: LLMRequest): Promise<LLMResponse> {
  const provider = getProvider(request.provider);
  return provider.chatCompletion(request);
}
