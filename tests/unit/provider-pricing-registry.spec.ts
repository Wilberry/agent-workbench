import { describe, expect, it } from 'vitest';
import {
  getPricingCatalogVersion,
  getPricingProvider,
  listModelPricing,
  PRICING_CATALOG_VERSION,
  UnknownModelPricingError
} from '@agent-workbench/agent-runtime';

const usage = {
  prompt_tokens: 1000,
  completion_tokens: 500,
  total_tokens: 1500
};

describe('provider pricing registry', () => {
  it('exposes a stable catalog version on every entry', () => {
    const entries = listModelPricing();

    expect(getPricingCatalogVersion()).toBe(PRICING_CATALOG_VERSION);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.catalogVersion === PRICING_CATALOG_VERSION)).toBe(true);
    expect(entries.every((entry) => entry.provider === 'openai')).toBe(true);
  });

  it('keeps legacy OpenAI-default lookups compatible', () => {
    const pricing = getPricingProvider();

    expect(pricing.getModelPricing('gpt-4o-mini')).toEqual(
      pricing.getModelPricing('gpt-4o-mini', 'openai')
    );
    expect(pricing.estimateCost('gpt-4o-mini', usage)).toBe(
      pricing.estimateCost('gpt-4o-mini', usage, 'openai')
    );
  });

  it('does not match a model across provider boundaries', () => {
    const pricing = getPricingProvider();

    expect(pricing.getModelPricing('gpt-4o-mini', 'anthropic')).toBeNull();
  });

  it('includes provider identity in non-OpenAI pricing failures', () => {
    const pricing = getPricingProvider();

    expect(() => pricing.estimateCost('future-model', usage, 'anthropic')).toThrow(
      'No pricing is configured for provider/model: anthropic/future-model'
    );

    try {
      pricing.estimateCost('future-model', usage, 'anthropic');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownModelPricingError);
      expect((error as UnknownModelPricingError).provider).toBe('anthropic');
      expect((error as UnknownModelPricingError).model).toBe('future-model');
    }
  });

  it('returns defensive catalog copies', () => {
    const first = listModelPricing('openai');
    const second = listModelPricing('openai');

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]?.aliases).not.toBe(second[0]?.aliases);
  });
});
