import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chatCompletion,
  listLLMProviders,
  listModelPricing
} from '@agent-workbench/agent-runtime';

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Anthropic provider', () => {
  it('reports Anthropic configuration through the provider registry', () => {
    delete process.env.ANTHROPIC_API_KEY;

    const anthropic = listLLMProviders().find((provider) => provider.name === 'anthropic');

    expect(anthropic).toMatchObject({
      name: 'anthropic',
      configured: false,
      missingEnv: ['ANTHROPIC_API_KEY'],
      internal: false
    });
  });

  it('translates the generic LLM request into the Anthropic Messages API contract', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'from Claude' }
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await chatCompletion({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: 'You are precise.' },
        { role: 'user', content: 'Hello' }
      ],
      temperature: 0.7,
      max_tokens: 900
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(String(init.body));

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('test-anthropic-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(body).toEqual({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: 'You are precise.',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    expect(body).not.toHaveProperty('temperature');

    expect(response).toMatchObject({
      content: 'Hello\nfrom Claude',
      provider_name: 'anthropic',
      model_name: 'claude-sonnet-4-6',
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500
    });
    expect(response.estimated_cost).toBeCloseTo(0.0105, 10);
  });

  it('rejects assistant-prefill shaped requests before calling Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatCompletion({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        messages: [
          { role: 'user', content: 'Complete this' },
          { role: 'assistant', content: 'The answer is' }
        ]
      })
    ).rejects.toThrow('final conversational message to have role user');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces Anthropic HTTP failures with status and response text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '{"type":"error","error":{"type":"rate_limit_error"}}'
    })));

    await expect(
      chatCompletion({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }]
      })
    ).rejects.toThrow('Anthropic request failed: 429');
  });

  it('adds stable Sonnet 4.6 pricing to catalog version 2', () => {
    const pricing = listModelPricing('anthropic');

    expect(pricing).toEqual([
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        promptPer1k: 0.003,
        completionPer1k: 0.015,
        catalogVersion: '2'
      })
    ]);
  });
});
