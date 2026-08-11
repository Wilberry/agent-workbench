export type AgentWorkbenchPublicApiErrorCode = string;

export type PublicApiAgent = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  provider: string;
  created_at: string;
};

export type PublicApiRequestOptions = {
  signal?: AbortSignal;
};

export type AgentWorkbenchClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export class AgentWorkbenchApiError extends Error {
  readonly status: number;
  readonly code: AgentWorkbenchPublicApiErrorCode;

  constructor(message: string, status: number, code: AgentWorkbenchPublicApiErrorCode) {
    super(message);
    this.name = 'AgentWorkbenchApiError';
    this.status = status;
    this.code = code;
  }
}

type ErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

type DataEnvelope<T> = {
  data?: T;
};

function normalizeBaseUrl(value: string): string {
  const baseUrl = value.trim();
  if (!baseUrl) throw new Error('Agent Workbench baseUrl is required');

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Agent Workbench baseUrl must be an absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Agent Workbench baseUrl must use http or https');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Agent Workbench baseUrl must not include a query string or fragment');
  }

  return baseUrl.replace(/\/+$/, '');
}

function normalizeApiKey(value: string): string {
  const apiKey = value.trim();
  if (!apiKey) throw new Error('Agent Workbench apiKey is required');
  return apiKey;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromResponse(response: Response, payload: unknown): AgentWorkbenchApiError {
  const envelope = payload && typeof payload === 'object' ? (payload as ErrorEnvelope) : {};
  const rawCode = envelope.error?.code;
  const rawMessage = envelope.error?.message;
  const code = typeof rawCode === 'string' && rawCode ? rawCode : `http_${response.status}`;
  const message =
    typeof rawMessage === 'string' && rawMessage
      ? rawMessage
      : `Agent Workbench API request failed with status ${response.status}`;

  return new AgentWorkbenchApiError(message, response.status, code);
}

export function createAgentWorkbenchClient(options: AgentWorkbenchClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const fetcher = options.fetch ?? globalThis.fetch;

  if (!fetcher) {
    throw new Error('A fetch implementation is required to use the Agent Workbench public API client');
  }

  async function request<T>(path: string, requestOptions?: PublicApiRequestOptions): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: requestOptions?.signal
      });
    } catch (error) {
      if (requestOptions?.signal?.aborted) throw error;
      throw new AgentWorkbenchApiError(
        'Unable to reach the Agent Workbench API',
        0,
        'network_error'
      );
    }

    const payload = await readJson(response);
    if (!response.ok) throw errorFromResponse(response, payload);
    if (!payload || typeof payload !== 'object') {
      throw new AgentWorkbenchApiError(
        'Agent Workbench API returned an invalid response',
        response.status,
        'invalid_response'
      );
    }

    return payload as T;
  }

  return {
    agents: {
      async list(requestOptions?: PublicApiRequestOptions): Promise<PublicApiAgent[]> {
        const payload = await request<DataEnvelope<unknown>>('/api/v1/agents', requestOptions);
        if (!Array.isArray(payload.data)) {
          throw new AgentWorkbenchApiError(
            'Agent Workbench API returned an invalid agents response',
            200,
            'invalid_response'
          );
        }
        return payload.data as PublicApiAgent[];
      }
    }
  };
}

export type AgentWorkbenchClient = ReturnType<typeof createAgentWorkbenchClient>;
