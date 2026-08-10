import {
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_PROVIDER_TIMEOUT_MS
} from './http';
import { getPricingCatalogVersion, listModelPricing } from './pricing';
import { listLLMProviders } from './registry';

export type LLMProviderHealth = {
  name: string;
  status: 'ready' | 'unconfigured';
  configured: boolean;
  missingEnv: string[];
  internal: boolean;
  supportedModels: string[];
  pricingCatalogVersion: string | null;
  reliability: {
    timeout_ms: number;
    max_retries: number;
  };
  check: 'local_configuration';
};

/**
 * Report provider readiness without sending a paid or stateful request to a
 * model provider. This is a local configuration/capability check, not an
 * external reachability probe.
 */
export function listLLMProviderHealth(options?: { includeInternal?: boolean }): LLMProviderHealth[] {
  return listLLMProviders(options).map((provider) => {
    const pricing = listModelPricing(provider.name);

    return {
      name: provider.name,
      status: provider.configured ? 'ready' : 'unconfigured',
      configured: provider.configured,
      missingEnv: [...provider.missingEnv],
      internal: provider.internal,
      supportedModels: pricing.map((entry) => entry.model),
      pricingCatalogVersion: pricing.length > 0 ? getPricingCatalogVersion() : null,
      reliability: {
        timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
        max_retries: DEFAULT_PROVIDER_MAX_RETRIES
      },
      check: 'local_configuration'
    };
  });
}
