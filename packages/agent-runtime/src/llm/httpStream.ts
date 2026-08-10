import {
  AgentExecutionCancelledError,
  cancellationReason,
  throwIfAborted
} from '../cancellation';
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

function linkExternalAbort(controller: AbortController, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

async function sleepWithSignal(
  ms: number,
  sleep: (ms: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  if (!signal) {
    await sleep(ms);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new AgentExecutionCancelledError(cancellationReason(signal)));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void sleep(ms).then(
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
  });
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
    throwIfAborted(options.signal);
    const controller = new AbortController();
    const unlinkAbort = linkExternalAbort(controller, options.signal);
    const timeout = setTimeout(() => controller.abort('provider_timeout'), timeoutMs);
    let emitted = false;

    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throwIfAborted(options.signal);
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
        await sleepWithSignal(
          retryDelayMs(attempt, retryAfterMs, baseDelayMs, maxDelayMs, random),
          sleep,
          options.signal
        );
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
          throwIfAborted(options.signal);
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;
          emitted = true;
          yield value;
        }
      } finally {
        if (options.signal?.aborted) {
          try {
            await reader.cancel(cancellationReason(options.signal));
          } catch {
            // Best effort. The provider connection is already aborted.
          }
        }
        reader.releaseLock();
      }

      clearTimeout(timeout);
      throwIfAborted(options.signal);
      return;
    } catch (error) {
      clearTimeout(timeout);
      if (options.signal?.aborted) {
        throw new AgentExecutionCancelledError(cancellationReason(options.signal));
      }
      if (error instanceof AgentExecutionCancelledError) throw error;
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

      if (emitted || attempt >= maxAttempts) throw normalizedError;

      await sleepWithSignal(
        retryDelayMs(attempt, undefined, baseDelayMs, maxDelayMs, random),
        sleep,
        options.signal
      );
    } finally {
      clearTimeout(timeout);
      unlinkAbort();
    }
  }

  throw new Error(`Provider streaming reliability loop exited unexpectedly for ${provider}`);
}
