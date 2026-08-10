'use client';

import { useMemo, useState } from 'react';
import type { ModelProviderCatalogProvider } from '@/lib/modelProviderCatalog';

type Props = {
  catalog: ModelProviderCatalogProvider[];
  initialProvider?: string | null;
  initialModel?: string | null;
};

function normalizeProvider(provider?: string | null) {
  return provider?.trim().toLowerCase() || 'openai';
}

export default function ProviderModelFields({ catalog, initialProvider, initialModel }: Props) {
  const defaultProvider = useMemo(() => {
    const requested = normalizeProvider(initialProvider);
    if (catalog.some((provider) => provider.name === requested)) return requested;
    return catalog.find((provider) => provider.configured && provider.models.length > 0)?.name
      ?? catalog.find((provider) => provider.models.length > 0)?.name
      ?? 'openai';
  }, [catalog, initialProvider]);

  const initialProviderEntry = catalog.find((provider) => provider.name === defaultProvider);
  const initialModelIsAvailable = Boolean(
    initialModel && initialProviderEntry?.models.some((model) => model.id === initialModel)
  );
  const [provider, setProvider] = useState(defaultProvider);
  const [model, setModel] = useState(
    initialModelIsAvailable
      ? initialModel!
      : initialProviderEntry?.models[0]?.id ?? ''
  );

  const providerEntry = catalog.find((entry) => entry.name === provider);
  const currentProvider = normalizeProvider(initialProvider);
  const currentSelectionIsUnconfigured = Boolean(
    initialProvider &&
    currentProvider === provider &&
    !providerEntry?.configured
  );
  const selectedModel = providerEntry?.models.find((entry) => entry.id === model);
  const hasConfiguredProvider = catalog.some(
    (entry) => entry.configured && entry.models.length > 0
  );

  const onProviderChange = (nextProvider: string) => {
    setProvider(nextProvider);
    const nextEntry = catalog.find((entry) => entry.name === nextProvider);
    const shouldPreserveCurrent =
      nextProvider === currentProvider &&
      initialModel &&
      nextEntry?.models.some((entry) => entry.id === initialModel);
    setModel(shouldPreserveCurrent ? initialModel! : nextEntry?.models[0]?.id ?? '');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-200">Provider</label>
        <select
          name="provider"
          value={provider}
          onChange={(event) => onProviderChange(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
        >
          {catalog.map((entry) => {
            const isCurrent = entry.name === currentProvider;
            return (
              <option
                key={entry.name}
                value={entry.name}
                disabled={(!entry.configured || entry.models.length === 0) && !isCurrent}
              >
                {entry.label}
                {entry.configured
                  ? ''
                  : isCurrent
                    ? ' (current, unconfigured)'
                    : ' (unconfigured)'}
              </option>
            );
          })}
        </select>
        {currentSelectionIsUnconfigured ? (
          <p className="mt-2 text-sm text-amber-300">
            This is the agent&apos;s current provider, but it is not configured on this deployment. You can keep the current configuration or switch to a configured provider.
          </p>
        ) : null}
        {!hasConfiguredProvider ? (
          <p className="mt-2 text-sm text-amber-300">
            No live provider is configured on this deployment. Add a provider API key before creating a new provider/model configuration.
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-200">Model</label>
        <select
          name="model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={!providerEntry || providerEntry.models.length === 0}
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {(providerEntry?.models ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.id}</option>
          ))}
        </select>
        {selectedModel ? (
          <p className="mt-2 text-sm text-slate-500">
            Catalog v{selectedModel.catalogVersion ?? 'unversioned'} · ${selectedModel.inputPricePer1k.toFixed(4)}/1k input · ${selectedModel.outputPricePer1k.toFixed(4)}/1k output
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-300">No metered model is available for this provider.</p>
        )}
      </div>
    </div>
  );
}
