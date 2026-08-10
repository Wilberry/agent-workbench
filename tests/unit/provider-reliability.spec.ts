import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  LLMProviderRequestError,
  LLMProviderTimeoutError,
  listLLMProviderHealth,
  parseRetryAfterMs,
  requestWithProviderReliability
} from '@agent-workbench/agent-runtime';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;

  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
});

describe('provider reliability transport', () => {
  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfterMs(new Headers({ 'retry-after': '2' }))).toBe(2000);

    const now = Date.parse('2026-08-10T10:00:00Z');
    expect(
      parseRetryAfterMs(
        new Headers({ 'retry-after': 'Mon, 10 Aug 2026 10:00:02 GMT' }),
        now
      )
    ).toBe(2000);
  });

  it('honors Retry-After on a 429 before retrying', async () => {
    let calls = 0;
    const delays: number[] = [];

    const response = await requestWithProviderReliability(
      'anthropic',
      'https://example.test/messages',
      { method: 'POST' },
      {
        maxRetries: 1,
        fetchImpl: (async () => {
          calls += 1;
          if (calls === 1) {
            return new Response('rate limited', {
              status: 429,
              headers: { 'retry-after': '2' }
            });
          }
          return new Response('ok', { status: 200 });
        }) as typeof fetch,
        sleep: async (ms) => {
          delays.push(ms);
        }
      }
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(delays).toEqual([2000]);
  });

  it('does not retry non-retryable 4xx responses', async () => {
    let calls = 0;

    try {
      await requestWithProviderReliability(
        'openai',
        'https://example.test/chat',
        { method: 'POST' },
        {
          maxRetries: 2,
          fetchImpl: (async () => {
            calls += 1;
            return new Response('bad request', { status: 400 });
          }) as typeof fetch,
          sleep: async () => {
            throw new Error('sleep should not be called');
          }
        }
      );
      throw new Error('Expected provider request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMProviderRequestError);
      const providerError = error as LLMProviderRequestError;
      expect(providerError.status).toBe(400);
      expect(providerError.retryable).toBe(false);
      expect(providerError.attempts).toBe(1);
      expect(providerError.message).toContain('OpenAI request failed: 400 bad request');
    }

    expect(calls).toBe(1);
  });

  it('uses bounded exponential backoff for retryable 5xx responses', async () => {
    let calls = 0;
    const delays: number[] = [];

    const response = await requestWithProviderReliability(
      'openai',
      'https://example.test/chat',
      { method: 'POST' },
      {
        maxRetries: 1,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        random: () => 0.5,
        fetchImpl: (async () => {
          calls += 1;
          return calls === 1
            ? new Response('server error', { status: 500 })
            : new Response('ok', { status: 200 });
        }) as typeof fetch,
        sleep: async (ms) => {
          delays.push(ms);
        }
      }
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(delays).toEqual([100]);
  });

  it('preserves provider request IDs on terminal HTTP failures', async () => {
    await expect(
      requestWithProviderReliability(
        'openai',
        'https://example.test/chat',
        { method: 'POST' },
        {
          maxRetries: 0,
          fetchImpl: (async () =>
            new Response('server error', {
              status: 500,
              headers: { 'x-request-id': 'req_123' }
            })) as typeof fetch
        }
      )
    ).rejects.toMatchObject({
      requestId: 'req_123',
      attempts: 1,
      retryable: true,
      status: 500
    });
  });

  it('retries transient network failures', async () => {
    let calls = 0;
    const delays: number[] = [];

    const response = await requestWithProviderReliability(
      'anthropic',
      'https://example.test/messages',
      { method: 'POST' },
      {
        maxRetries: 1,
        baseDelayMs: 100,
        random: () => 0.5,
        fetchImpl: (async () => {
          calls += 1;
          if (calls === 1) throw new TypeError('socket reset');
          return new Response('ok', { status: 200 });
        }) as typeof fetch,
        sleep: async (ms) => {
          delays.push(ms);
        }
      }
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(delays).toEqual([100]);
  });

  it('converts aborted provider attempts into structured timeout errors', async () => {
    const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })) as typeof fetch;

    try {
      await requestWithProviderReliability(
        'anthropic',
        'https://example.test/messages',
        { method: 'POST' },
        {
          timeoutMs: 10,
          maxRetries: 0,
          fetchImpl
        }
      );
      throw new Error('Expected timeout');
    } catch (error) {
      expect(error).toBeInstanceOf(LLMProviderTimeoutError);
      const timeoutError = error as LLMProviderTimeoutError;
      expect(timeoutError.code).toBe('LLM_PROVIDER_TIMEOUT');
      expect(timeoutError.retryable).toBe(true);
      expect(timeoutError.status).toBeNull();
      expect(timeoutError.attempts).toBe(1);
    }
  });
});

describe('provider readiness reporting', () => {
  it('reports local configuration, metered models, and reliability defaults without probing providers', () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'configured';

    const health = listLLMProviderHealth();
    const anthropic = health.find((provider) => provider.name === 'anthropic');
    const openai = health.find((provider) => provider.name === 'openai');

    expect(anthropic).toMatchObject({
      status: 'ready',
      configured: true,
      missingEnv: [],
      supportedModels: ['claude-sonnet-4-6'],
      pricingCatalogVersion: '2',
      reliability: {
        timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
        max_retries: DEFAULT_PROVIDER_MAX_RETRIES
      },
      check: 'local_configuration'
    });

    expect(openai).toMatchObject({
      status: 'unconfigured',
      configured: false,
      missingEnv: ['OPENAI_API_KEY'],
      pricingCatalogVersion: '2',
      check: 'local_configuration'
    });

    expect(health.some((provider) => provider.name === 'mock')).toBe(false);
  });
});
