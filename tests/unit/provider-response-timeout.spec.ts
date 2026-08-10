import { describe, expect, it } from 'vitest';
import {
  LLMProviderTimeoutError,
  requestWithProviderReliability
} from '@agent-workbench/agent-runtime';

describe('provider response timeout boundary', () => {
  it('times out while a provider response body is stalled after headers arrive', async () => {
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    await expect(
      requestWithProviderReliability(
        'anthropic',
        'https://example.test/messages',
        { method: 'POST' },
        {
          timeoutMs: 10,
          maxRetries: 0,
          fetchImpl
        }
      )
    ).rejects.toBeInstanceOf(LLMProviderTimeoutError);
  });
});
