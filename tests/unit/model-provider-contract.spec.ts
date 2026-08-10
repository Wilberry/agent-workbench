import { afterEach, describe, expect, it } from 'vitest';
import {
  chatCompletion,
  LLMConfigurationError,
  listLLMProviders,
  UnsupportedLLMProviderError
} from '@agent-workbench/agent-runtime';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalMockFlag = process.env.USE_MOCK_OPENAI;

afterEach(() => {
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;

  if (originalMockFlag === undefined) delete process.env.USE_MOCK_OPENAI;
  else process.env.USE_MOCK_OPENAI = originalMockFlag;
});

describe('model provider contract', () => {
  it('reports provider configuration without network calls', () => {
    delete process.env.OPENAI_API_KEY;

    const providers = listLLMProviders({ includeInternal: true });
    const openai = providers.find((provider) => provider.name === 'openai');
    const mock = providers.find((provider) => provider.name === 'mock');

    expect(openai).toMatchObject({
      name: 'openai',
      configured: false,
      missingEnv: ['OPENAI_API_KEY'],
      internal: false
    });
    expect(mock).toMatchObject({
      name: 'mock',
      configured: true,
      missingEnv: [],
      internal: true
    });
  });

  it('keeps the explicit OpenAI mock override observable', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.USE_MOCK_OPENAI = 'true';

    const response = await chatCompletion({
      provider: ' OPENAI ',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello provider registry' }]
    });

    expect(response.provider_name).toBe('mock');
    expect(response.model_name).toBe('gpt-4o-mini');
    expect(response.content).toContain('Mock response');
  });

  it('fails explicitly when a registered provider is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.USE_MOCK_OPENAI;

    await expect(
      chatCompletion({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).rejects.toBeInstanceOf(LLMConfigurationError);
  });

  it('rejects provider names that are not registered', async () => {
    await expect(
      chatCompletion({
        provider: 'provider-that-does-not-exist',
        model: 'any-model',
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).rejects.toBeInstanceOf(UnsupportedLLMProviderError);
  });
});
