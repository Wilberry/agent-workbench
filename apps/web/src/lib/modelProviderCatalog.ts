import {
  listLLMProviderHealth,
  listModelPricing
} from '@agent-workbench/agent-runtime';

export type ModelProviderCatalogModel = {
  id: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
  currency: 'USD';
  catalogVersion: string | null;
};

export type ModelProviderCatalogProvider = {
  name: string;
  label: string;
  configured: boolean;
  models: ModelProviderCatalogModel[];
};

export type ProviderModelSelection = {
  provider: string;
  model: string;
};

function normalizeProviderName(provider?: string | null): string {
  return provider?.trim().toLowerCase() || 'openai';
}

function normalizeModelName(model?: string | null): string {
  return model?.trim() ?? '';
}

function providerLabel(provider: string): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  return provider
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Browser-safe provider/model catalog. Environment variable names and other
 * provider configuration details stay server-side; callers receive only
 * readiness plus metered model/pricing metadata.
 */
export function getModelProviderCatalog(): ModelProviderCatalogProvider[] {
  return listLLMProviderHealth()
    .filter((provider) => !provider.internal)
    .map((provider) => ({
      name: provider.name,
      label: providerLabel(provider.name),
      configured: provider.configured,
      models: listModelPricing(provider.name).map((pricing) => ({
        id: pricing.model,
        inputPricePer1k: pricing.promptPer1k,
        outputPricePer1k: pricing.completionPer1k,
        currency: pricing.currency,
        catalogVersion: pricing.catalogVersion ?? null
      }))
    }))
    .sort((a, b) => {
      if (a.name === 'openai') return -1;
      if (b.name === 'openai') return 1;
      return a.name.localeCompare(b.name);
    });
}

export function assertSelectableProviderModel(
  providerValue: string | null | undefined,
  modelValue: string | null | undefined,
  options?: { allowCurrent?: ProviderModelSelection | null }
): ProviderModelSelection {
  const provider = normalizeProviderName(providerValue);
  const model = normalizeModelName(modelValue);

  if (!model) {
    throw new Error('Model is required');
  }

  const catalog = getModelProviderCatalog();
  const providerEntry = catalog.find((entry) => entry.name === provider);
  if (!providerEntry) {
    throw new Error(`Provider is not available: ${provider}`);
  }

  const modelEntry = providerEntry.models.find((entry) => entry.id === model);
  if (!modelEntry) {
    throw new Error(`Model is not available for ${provider}: ${model}`);
  }

  const currentProvider = normalizeProviderName(options?.allowCurrent?.provider);
  const currentModel = normalizeModelName(options?.allowCurrent?.model);
  const isCurrentSelection = Boolean(
    options?.allowCurrent &&
    provider === currentProvider &&
    model === currentModel
  );

  if (!providerEntry.configured && !isCurrentSelection) {
    throw new Error(`${providerEntry.label} is not configured for this deployment`);
  }

  return { provider, model };
}
