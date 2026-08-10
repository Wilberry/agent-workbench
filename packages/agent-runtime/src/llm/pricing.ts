import type { LLMUsage, ModelPricing, PricingProvider } from './types';

export const PRICING_CATALOG_VERSION = '2';

const pricingCatalog: ReadonlyArray<ModelPricing> = [
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    currency: 'USD',
    promptPer1k: 0.3,
    completionPer1k: 0.3,
    aliases: ['gpt-4o-mini'],
    catalogVersion: PRICING_CATALOG_VERSION
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    currency: 'USD',
    promptPer1k: 0.6,
    completionPer1k: 0.6,
    aliases: ['gpt-4o'],
    catalogVersion: PRICING_CATALOG_VERSION
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    currency: 'USD',
    promptPer1k: 0.0015,
    completionPer1k: 0.002,
    aliases: ['gpt-3.5-turbo'],
    catalogVersion: PRICING_CATALOG_VERSION
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    currency: 'USD',
    promptPer1k: 0.003,
    completionPer1k: 0.015,
    catalogVersion: PRICING_CATALOG_VERSION
  }
];

export class UnknownModelPricingError extends Error {
  code = 'UNKNOWN_MODEL_PRICING';

  constructor(
    public readonly model: string,
    public readonly provider: string = 'openai'
  ) {
    super(
      provider === 'openai'
        ? `No pricing is configured for model: ${model}`
        : `No pricing is configured for provider/model: ${provider}/${model}`
    );
    this.name = 'UnknownModelPricingError';
  }
}

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

function normalizeProviderName(provider?: string | null): string {
  return provider?.trim().toLowerCase() || 'openai';
}

function matchesModel(candidate: string, configured: string): boolean {
  const normalizedCandidate = normalizeModelName(candidate);
  const normalizedConfigured = normalizeModelName(configured);
  return normalizedCandidate === normalizedConfigured || normalizedCandidate.startsWith(`${normalizedConfigured}-`);
}

function findPricing(model: string, provider = 'openai'): ModelPricing | null {
  const normalizedProvider = normalizeProviderName(provider);
  return (
    pricingCatalog.find((item) =>
      normalizeProviderName(item.provider) === normalizedProvider &&
      (matchesModel(model, item.model) || item.aliases?.some((alias) => matchesModel(model, alias)))
    ) ?? null
  );
}

export const pricingProvider: PricingProvider = {
  getModelPricing(model: string, provider = 'openai') {
    return findPricing(model, provider);
  },
  estimateCost(model: string, usage: LLMUsage, provider = 'openai') {
    const normalizedProvider = normalizeProviderName(provider);
    const pricing = findPricing(model, normalizedProvider);
    if (!pricing) {
      throw new UnknownModelPricingError(model, normalizedProvider);
    }
    return (
      (pricing.promptPer1k * usage.prompt_tokens) / 1000 +
      (pricing.completionPer1k * usage.completion_tokens) / 1000
    );
  }
};

export function getPricingProvider(): PricingProvider {
  return pricingProvider;
}

export function getPricingCatalogVersion(): string {
  return PRICING_CATALOG_VERSION;
}

export function listModelPricing(provider?: string): ModelPricing[] {
  const normalizedProvider = provider ? normalizeProviderName(provider) : null;
  return pricingCatalog
    .filter((entry) => !normalizedProvider || normalizeProviderName(entry.provider) === normalizedProvider)
    .map((entry) => ({
      ...entry,
      aliases: entry.aliases ? [...entry.aliases] : undefined
    }));
}
