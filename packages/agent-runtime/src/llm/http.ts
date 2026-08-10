export const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;
export const DEFAULT_PROVIDER_MAX_RETRIES = 2;
export const DEFAULT_PROVIDER_RETRY_BASE_MS = 500;
export const DEFAULT_PROVIDER_RETRY_MAX_MS = 8_000;

export type ProviderReliabilityOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type ProviderHttpResponse = {
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
};

export class LLMProviderRequestError extends Error {
  code = 'LLM_PROVIDER_REQUEST_ERROR';

  constructor(
    public readonly provider: string,
    message: string,
    public readonly details: {
      status: number | null;
      retryable: boolean;
      retryAfterMs?: number;
      requestId?: string;
      responseBody?: string;
      attempts: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'LLMProviderRequestError';
  }

  get status() {
    return this.details.status;
  }

  get retryable() {
    return this.details.retryable;
  }

  get retryAfterMs() {
    return this.details.retryAfterMs;
  }

  get requestId() {
    return this.details.requestId;
  }

  get attempts() {
    return this.details.attempts;
  }
}

export class LLMProviderTimeoutError extends LLMProviderRequestError {
  override code = 'LLM_PROVIDER_TIMEOUT';

  constructor(provider: string, timeoutMs: number, attempts: number, cause?: unknown) {
    super(
      provider,
      `${providerDisplayName(provider)} request timed out after ${timeoutMs}ms`,
      {
        status: null,
        retryable: true,
        attempts,
        cause
      }
    );
    this.name = 'LLMProviderTimeoutError';
  }
}

export function isProviderRequestError(error: unknown): error is LLMProviderRequestError {
  if (error instanceof LLMProviderRequestError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: unknown;
    retryable?: unknown;
    provider?: unknown;
  };
  return (
    (candidate.code === 'LLM_PROVIDER_REQUEST_ERROR' || candidate.code === 'LLM_PROVIDER_TIMEOUT') &&
    typeof candidate.retryable === 'boolean' &&
    typeof candidate.provider === 'string'
  );
}

function providerDisplayName(provider: string): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  return provider;
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function parseRetryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const value = headers.get('retry-after')?.trim();
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - now);
}

export function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
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

export async function requestWithProviderReliability(
  provider: string,
  url: string,
  init: RequestInit,
  options: ProviderReliabilityOptions = {}
): Promise<ProviderHttpResponse> {
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

    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal
      });
      // Buffer the body while the attempt timer is still active so the timeout
      // covers the full provider response, not only receipt of HTTP headers.
      const responseBody = await response.text();
      clearTimeout(timeout);

      if (response.ok) {
        return {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
          body: responseBody
        };
      }

      const retryAfterMs = parseRetryAfterMs(response.headers);
      const retryable = isRetryableProviderStatus(response.status);
      const error = new LLMProviderRequestError(
        provider,
        `${providerDisplayName(provider)} request failed: ${response.status} ${responseBody}`,
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

      await sleep(
        retryDelayMs(attempt, retryAfterMs, baseDelayMs, maxDelayMs, random)
      );
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof LLMProviderRequestError) throw error;

      const timedOut = controller.signal.aborted;
      const normalizedError = timedOut
        ? new LLMProviderTimeoutError(provider, timeoutMs, attempt, error)
        : new LLMProviderRequestError(
            provider,
            `${providerDisplayName(provider)} request failed before receiving a complete response`,
            {
              status: null,
              retryable: true,
              attempts: attempt,
              cause: error
            }
          );

      if (attempt >= maxAttempts) throw normalizedError;

      await sleep(
        retryDelayMs(attempt, undefined, baseDelayMs, maxDelayMs, random)
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Provider reliability loop exited unexpectedly for ${provider}`);
}
