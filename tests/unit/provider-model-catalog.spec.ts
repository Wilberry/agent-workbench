import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSelectableProviderModel,
  getModelProviderCatalog
} from '@/lib/modelProviderCatalog';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;

  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
});

describe('browser-safe provider model catalog', () => {
  it('exposes readiness and metered models without environment variable names', () => {
    process.env.OPENAI_API_KEY = 'configured';
    delete process.env.ANTHROPIC_API_KEY;

    const catalog = getModelProviderCatalog();
    const openai = catalog.find((provider) => provider.name === 'openai');
    const anthropic = catalog.find((provider) => provider.name === 'anthropic');

    expect(openai).toMatchObject({
      name: 'openai',
      label: 'OpenAI',
      configured: true
    });
    expect(openai?.models.some((model) => model.id === 'gpt-4o-mini')).toBe(true);

    expect(anthropic).toMatchObject({
      name: 'anthropic',
      label: 'Anthropic',
      configured: false
    });
    expect(anthropic?.models).toEqual([
      expect.objectContaining({ id: 'claude-sonnet-4-6', catalogVersion: '2' })
    ]);

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain('OPENAI_API_KEY');
    expect(serialized).not.toContain('ANTHROPIC_API_KEY');
    expect(serialized).not.toContain('missingEnv');
  });

  it('accepts only configured and metered provider/model pairs for new selections', () => {
    process.env.OPENAI_API_KEY = 'configured';
    delete process.env.ANTHROPIC_API_KEY;

    expect(assertSelectableProviderModel(' OPENAI ', 'gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini'
    });

    expect(() =>
      assertSelectableProviderModel('anthropic', 'claude-sonnet-4-6')
    ).toThrow('Anthropic is not configured for this deployment');

    expect(() =>
      assertSelectableProviderModel('openai', 'claude-sonnet-4-6')
    ).toThrow('Model is not available for openai: claude-sonnet-4-6');

    expect(() =>
      assertSelectableProviderModel('provider-that-does-not-exist', 'any-model')
    ).toThrow('Provider is not available: provider-that-does-not-exist');
  });

  it('allows an existing metered selection to remain while its provider is temporarily unconfigured', () => {
    delete process.env.OPENAI_API_KEY;

    expect(
      assertSelectableProviderModel('openai', 'gpt-4o-mini', {
        allowCurrent: { provider: 'openai', model: 'gpt-4o-mini' }
      })
    ).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('allows Anthropic selection when Anthropic is configured', () => {
    process.env.ANTHROPIC_API_KEY = 'configured';

    expect(
      assertSelectableProviderModel('anthropic', 'claude-sonnet-4-6')
    ).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6'
    });
  });
});
