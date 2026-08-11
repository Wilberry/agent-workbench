import { describe, expect, it, vi } from 'vitest';
import {
  AgentWorkbenchApiError,
  createAgentWorkbenchClient
} from '@agent-workbench/sdk';

const agent = {
  id: 'agent-1',
  organization_id: 'org-1',
  name: 'Support Agent',
  description: 'Handles support requests',
  system_prompt: 'Be helpful.',
  model: 'gpt-4o-mini',
  provider: 'openai',
  created_at: '2026-08-11T00:00:00.000Z'
};

describe('Agent Workbench public API client', () => {
  it('lists agents with bearer authentication and normalized base URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [agent] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com/',
      apiKey: '  awb_live_test  ',
      fetch: fetchMock
    });

    await expect(client.agents.list()).resolves.toEqual([agent]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://workbench.example.com/api/v1/agents',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer awb_live_test'
        }
      })
    );
  });

  it('forwards an AbortSignal to fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const controller = new AbortController();
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_test',
      fetch: fetchMock
    });

    await client.agents.list({ signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://workbench.example.com/api/v1/agents',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('turns stable API error envelopes into AgentWorkbenchApiError', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'insufficient_scope',
        message: 'API key does not have the required scope'
      }
    }), { status: 403 }));
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_test',
      fetch: fetchMock
    });

    let captured: unknown;
    try {
      await client.agents.list();
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(AgentWorkbenchApiError);
    expect(captured).toMatchObject({
      status: 403,
      code: 'insufficient_scope',
      message: 'API key does not have the required scope'
    });
  });

  it('uses a deterministic fallback for non-JSON HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response('gateway unavailable', { status: 502 }));
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_test',
      fetch: fetchMock
    });

    await expect(client.agents.list()).rejects.toMatchObject({
      status: 502,
      code: 'http_502',
      message: 'Agent Workbench API request failed with status 502'
    });
  });

  it('rejects malformed successful responses', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_test',
      fetch: fetchMock
    });

    await expect(client.agents.list()).rejects.toMatchObject({
      status: 200,
      code: 'invalid_response'
    });
  });

  it('normalizes fetch failures into a network error without exposing the API key', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('socket failed for awb_live_secret');
    });
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_secret',
      fetch: fetchMock
    });

    let captured: unknown;
    try {
      await client.agents.list();
    } catch (error) {
      captured = error;
    }

    expect(captured).toMatchObject({
      status: 0,
      code: 'network_error',
      message: 'Unable to reach the Agent Workbench API'
    });
    expect(String((captured as Error).message)).not.toContain('awb_live_secret');
  });

  it('rejects invalid client configuration before making a request', () => {
    const fetchMock = vi.fn();

    expect(() => createAgentWorkbenchClient({
      baseUrl: 'not-a-url',
      apiKey: 'awb_live_test',
      fetch: fetchMock
    })).toThrow('baseUrl must be an absolute URL');

    expect(() => createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: '   ',
      fetch: fetchMock
    })).toThrow('apiKey is required');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
