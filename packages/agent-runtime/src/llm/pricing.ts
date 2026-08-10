import type { LLMUsage, ModelPricing, PricingProvider } from './types';

const pricingCatalog: ModelPricing[] = [
  { model: 'gpt-4o-mini', currency: 'USD', promptPer1k: 0.3, completionPer1k: 0.3, aliases: ['gpt-4o-mini'] },
  { model: 'gpt-4o', currency: 'USD', promptPer1k: 0.6, completionPer1k: 0.6, aliases: ['gpt-4o'] },
  { model: 'gpt-3.5-turbo', currency: 'USD', promptPer1k: 0.0015, completionPer1k: 0.002, aliases: ['gpt-3.5-turbo'] }
];

export class UnknownModelPricingError extends Error {
  code = 'UNKNOWN_MODEL_PRICING';

  constructor(public readonly model: string) {
    super(`No pricing is configured for model: ${model}`);
    this.name = 'UnknownModelPricingError';
  }
}

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

function matchesModel(candidate: string, configured: string): boolean {
  const normalizedCandidate = normalizeModelName(candidate);
  const normalizedConfigured = normalizeModelName(configured);
  return normalizedCandidate === normalizedConfigured || normalizedCandidate.startsWith(`${normalizedConfigured}-`);
}

function findPricing(model: string): ModelPricing | null {
  return (
    pricingCatalog.find((item) =>
      matchesModel(model, item.model) || item.aliases?.some((alias) => matchesModel(model, alias))
    ) ?? null
  );
}

export const pricingProvider: PricingProvider = {
  getModelPricing(model: string) {
    return findPricing(model);
  },
  estimateCost(model: string, usage: LLMUsage) {
    const pricing = findPricing(model);
    if (!pricing) {
      throw new UnknownModelPricingError(model);
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
