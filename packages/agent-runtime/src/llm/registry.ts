import type { LLMProvider } from './types';
import { anthropicProvider } from './providers/anthropic';
import { openaiProvider } from './providers/openai';
import { mockProvider } from './providers/mock';

export type LLMProviderRegistration = {
  provider: LLMProvider;
  requiredEnv: string[];
  internal?: boolean;
};

export type LLMProviderInfo = {
  name: string;
  configured: boolean;
  missingEnv: string[];
  internal: boolean;
};

const registry = new Map<string, LLMProviderRegistration>();

export function normalizeProviderName(provider?: string | null): string {
  return provider?.trim().toLowerCase() || 'openai';
}

export function registerLLMProvider(registration: LLMProviderRegistration): void {
  const name = normalizeProviderName(registration.provider.name);
  if (registry.has(name)) {
    throw new Error(`LLM provider is already registered: ${name}`);
  }

  // Keep the adapter object intact so class/prototype-based providers remain
  // usable; the normalized map key is the canonical provider identifier.
  registry.set(name, registration);
}

export function getLLMProviderRegistration(provider?: string | null): LLMProviderRegistration | null {
  return registry.get(normalizeProviderName(provider)) ?? null;
}

export function listLLMProviders(options?: { includeInternal?: boolean }): LLMProviderInfo[] {
  const includeInternal = options?.includeInternal ?? false;
  return Array.from(registry.entries())
    .filter(([, registration]) => includeInternal || !registration.internal)
    .map(([name, registration]) => {
      const missingEnv = registration.requiredEnv.filter((key) => !process.env[key]);
      return {
        name,
        configured: missingEnv.length === 0,
        missingEnv,
        internal: Boolean(registration.internal)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

registerLLMProvider({
  provider: anthropicProvider,
  requiredEnv: ['ANTHROPIC_API_KEY']
});

registerLLMProvider({
  provider: openaiProvider,
  requiredEnv: ['OPENAI_API_KEY']
});

registerLLMProvider({
  provider: mockProvider,
  requiredEnv: [],
  internal: true
});
