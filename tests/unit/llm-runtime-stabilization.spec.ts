import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chatCompletion,
  LLMConfigurationError,
  UnsupportedLLMProviderError
} from '@agent-workbench/agent-runtime/llm/client';
import { getPricingProvider } from '@agent-workbench/agent-runtime/llm/pricing';

const managedVariables = ['OPENAI_API_KEY', 'USE_MOCK_OPENAI'] as const;
const originalEnvironment = Object.fromEntries(
  managedVariables.map((name) => [name, process.env[name]])
);

const request = {
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'hello' }]
};

describe('LLM runtime stabilization', () => {
  beforeEach(() => {
    for (const name of managedVariables) delete process.env[name];
  });

  afterEach(() => {
    for (const name of managedVariables) {
      const value = originalEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('requires OpenAI credentials unless the mock is explicitly enabled', async () => {
    await expect(chatCompletion(request)).rejects.toBeInstanceOf(LLMConfigurationError);
  });

  it('uses the mock provider only when explicitly enabled', async () => {
    process.env.USE_MOCK_OPENAI = 'true';

    const response = await chatCompletion(request);

    expect(response.content).toContain('Mock response: hello');
    expect(response.estimated_cost).toBe(0);
  });

  it('rejects unsupported providers instead of falling back to OpenAI', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    await expect(
      chatCompletion({ ...request, provider: 'anthropic' })
    ).rejects.toBeInstanceOf(UnsupportedLLMProviderError);
  });

  it('returns null when model pricing is unknown', () => {
    const pricing = getPricingProvider();

    expect(
      pricing.estimateCost('unknown-model', {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      })
    ).toBeNull();
  });

  it('still estimates cost for catalogued models', () => {
    const pricing = getPricingProvider();

    expect(
      pricing.estimateCost('gpt-4o-mini', {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      })
    ).toBeGreaterThan(0);
  });
});
