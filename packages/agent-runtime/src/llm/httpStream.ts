import {
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_PROVIDER_RETRY_BASE_MS,
  DEFAULT_PROVIDER_RETRY_MAX_MS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  LLMProviderRequestError,
  LLMProviderTimeoutError,
  isRetryableProviderStatus,
  parseRetryAfterMs,
  type ProviderReliabilityOptions
} from './http';

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function requestIdFromHeaders(headers: Headers): string | undefined {
  return headers.get('request-id') ?? headers.get('x-request-id') ?? undefined;
}

function retryDelayMs(
  retryNumber: number,
  retryAfterMs: number | undefined,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number
): number {
  if (retryAfterMs !== undefined) return retryAfterMs;

  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, retryNumber - 1));
  const jitterMultiplier = 0.75 + random() * 0.5;
  return Math.max(0, Math.round(exponential * jitterMultiplier));
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* streamProviderResponseWithReliability(
  provider: string,
  url: string,
  init: RequestInit,
  options: ProviderReliabilityOptions = {}
): AsyncGenerator<Uint8Array> {
  const timeoutMs = normalizePositiveNumber(options.timeoutMs, DEFAULT_PROVIDER_TIMEOUT_MS);
  const maxRetries = normalizeNonNegativeInteger(options.maxRetries, DEFAULT_PROVIDER_MAX_RETRIES);
  const baseDelayMs = normalizePositiveNumber(options.baseDelayMs, DEFAULT_PROVIDER_RETRY_BASE_MS);
  const maxDelayMs = normalizePositiveNumber(options.maxDelayMs, DEFAULT_PROVIDER_RETRY_MAX_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const maxAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let emitted = false;

    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const retryAfterMs = parseRetryAfterMs(response.headers);
        const retryable = isRetryableProviderStatus(response.status);
        const error = new LLMProviderRequestError(
          provider,
          `${provider} streaming request failed: ${response.status} ${responseBody}`,
          {
            status: response.status,
            retryable,
            retryAfterMs,
            requestId: requestIdFromHeaders(response.headers),
            responseBody,
            attempts: attempt
          }
        );

        if (!retryable || attempt >= maxAttempts) throw error;
        clearTimeout(timeout);
        await sleep(retryDelayMs(attempt, retryAfterMs, baseDelayMs, maxDelayMs, random));
        continue;
      }

      if (!response.body) {
        throw new LLMProviderRequestError(
          provider,
          `${provider} streaming response did not include a body`,
          {
            status: response.status,
            retryable: false,
            requestId: requestIdFromHeaders(response.headers),
            attempts: attempt
          }
        );
      }

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;
          emitted = true;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }

      clearTimeout(timeout);
      return;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof LLMProviderRequestError) throw error;

      const timedOut = controller.signal.aborted;
      const normalizedError = timedOut
        ? new LLMProviderTimeoutError(provider, timeoutMs, attempt, error)
        : new LLMProviderRequestError(
            provider,
            `${provider} streaming request failed before receiving a complete response`,
            {
              status: null,
              retryable: true,
              attempts: attempt,
              cause: error
            }
          );

      // Once any bytes have been emitted, retrying would replay already-observed
      // model output and potentially duplicate tool-call deltas. Surface the
      // failure instead and let the orchestration layer decide what is safe.
      if (emitted || attempt >= maxAttempts) throw normalizedError;

      await sleep(retryDelayMs(attempt, undefined, baseDelayMs, maxDelayMs, random));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Provider streaming reliability loop exited unexpectedly for ${provider}`);
}
