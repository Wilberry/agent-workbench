import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentWorkbenchApiError,
  createAgentWorkbenchClient,
  type PublicApiAgent
} from '@agent-workbench/sdk/public';
import { runCli } from '../../packages/cli/src/cli.mjs';

const routeSdk = vi.hoisted(() => ({
  parseBearerApiKey: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  authenticate: vi.fn(),
  listOrgAgents: vi.fn()
}));

vi.mock('@agent-workbench/sdk', () => ({
  parseBearerApiKey: routeSdk.parseBearerApiKey,
  createServerSupabaseClient: routeSdk.createServerSupabaseClient,
  apiKeys: { authenticate: routeSdk.authenticate },
  orgs: { listOrgAgents: routeSdk.listOrgAgents }
}));

import { GET } from '../../apps/web/src/app/api/v1/agents/route';

type OpenApiSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: string[];
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
};

type OpenApiResponse = {
  content?: {
    'application/json'?: {
      schema: OpenApiSchema;
    };
  };
  'x-agent-workbench-error-codes'?: string[];
};

type OpenApiOperation = {
  security?: Array<Record<string, unknown>>;
  responses: Record<string, OpenApiResponse>;
};

type OpenApiDocument = {
  openapi: string;
  info: { version: string };
  paths: Record<string, { get?: OpenApiOperation }>;
  components: {
    securitySchemes: Record<string, { type?: string; scheme?: string }>;
    schemas: Record<string, OpenApiSchema>;
  };
};

type ExpectedPublicApiAgent = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  provider: string;
  created_at: string;
};

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false;

type Assert<T extends true> = T;
type PublicApiAgentMatchesContract = Assert<Equal<PublicApiAgent, ExpectedPublicApiAgent>>;

const sdkTypeMatchesContract: PublicApiAgentMatchesContract = true;
const contractPath = resolve(process.cwd(), 'docs/openapi-v1.json');
const openApi = JSON.parse(readFileSync(contractPath, 'utf8')) as OpenApiDocument;
const publicAgentFields = [
  'id',
  'organization_id',
  'name',
  'description',
  'system_prompt',
  'model',
  'provider',
  'created_at'
];

const agent = {
  id: 'agent-1',
  organization_id: 'org-1',
  name: 'Support Agent',
  description: 'Handles support requests',
  system_prompt: 'Be helpful.',
  model: 'gpt-4o-mini',
  provider: 'openai',
  created_at: '2026-08-11T00:00:00.000Z'
} satisfies PublicApiAgent;

function listAgentsOperation(): OpenApiOperation {
  const operation = openApi.paths['/api/v1/agents']?.get;
  if (!operation) throw new Error('OpenAPI contract is missing GET /api/v1/agents');
  return operation;
}

function responseSchema(status: number): OpenApiSchema {
  const schema = listAgentsOperation().responses[String(status)]
    ?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`OpenAPI contract is missing JSON schema for ${status}`);
  return schema;
}

function resolveSchema(schema: OpenApiSchema): OpenApiSchema {
  if (!schema.$ref) return schema;
  const prefix = '#/components/schemas/';
  if (!schema.$ref.startsWith(prefix)) {
    throw new Error(`Unsupported OpenAPI reference: ${schema.$ref}`);
  }
  const resolved = openApi.components.schemas[schema.$ref.slice(prefix.length)];
  if (!resolved) throw new Error(`Missing OpenAPI schema: ${schema.$ref}`);
  return resolved;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === type;
}

function assertMatchesSchema(value: unknown, rawSchema: OpenApiSchema, path = '$'): void {
  const schema = resolveSchema(rawSchema);
  const acceptedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];

  if (acceptedTypes.length > 0) {
    expect(
      acceptedTypes.some((type) => matchesType(value, type)),
      `${path} should match ${acceptedTypes.join(' | ')}`
    ).toBe(true);
  }

  if (schema.enum) {
    expect(schema.enum, `${path} should match documented enum`).toContain(value);
  }

  if (schema.format === 'date-time' && typeof value === 'string') {
    expect(Number.isFinite(Date.parse(value)), `${path} should be a date-time`).toBe(true);
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => assertMatchesSchema(item, schema.items!, `${path}[${index}]`));
  }

  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      expect(record, `${path} should contain ${required}`).toHaveProperty(required);
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in record) assertMatchesSchema(record[key], propertySchema, `${path}.${key}`);
    }
  }
}

function resetRouteMocks(): void {
  routeSdk.parseBearerApiKey.mockReset();
  routeSdk.createServerSupabaseClient.mockReset();
  routeSdk.authenticate.mockReset();
  routeSdk.listOrgAgents.mockReset();

  routeSdk.parseBearerApiKey.mockReturnValue('awb_live_test');
  routeSdk.createServerSupabaseClient.mockReturnValue({ source: 'contract-test' });
  routeSdk.authenticate.mockResolvedValue({ organizationId: 'org-1' });
  routeSdk.listOrgAgents.mockResolvedValue([agent]);
}

function request(): Parameters<typeof GET>[0] {
  return new Request('https://workbench.example.com/api/v1/agents', {
    headers: { Authorization: 'Bearer awb_live_test' }
  }) as Parameters<typeof GET>[0];
}

function captureStream() {
  let value = '';
  return {
    stream: {
      write(chunk: string | Uint8Array) {
        value += String(chunk);
        return true;
      }
    },
    read: () => value
  };
}

beforeEach(() => {
  resetRouteMocks();
});

describe('public API v1 contract', () => {
  it('pins the versioned path, bearer auth, agent schema, and stable server error codes', () => {
    expect(openApi.openapi).toBe('3.1.0');
    expect(openApi.info.version).toBe('1.0.0');
    expect(Object.keys(openApi.paths)).toContain('/api/v1/agents');

    const operation = listAgentsOperation();
    expect(operation.security).toEqual([{ bearerApiKey: [] }]);
    expect(openApi.components.securitySchemes.bearerApiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer'
    });

    const agentSchema = openApi.components.schemas.PublicApiAgent;
    expect(agentSchema.required).toEqual(publicAgentFields);
    expect(Object.keys(agentSchema.properties ?? {})).toEqual(publicAgentFields);
    expect(sdkTypeMatchesContract).toBe(true);

    expect(operation.responses['401']?.['x-agent-workbench-error-codes']).toEqual([
      'missing_api_key',
      'invalid_api_key'
    ]);
    expect(operation.responses['403']?.['x-agent-workbench-error-codes']).toEqual([
      'insufficient_scope'
    ]);
    expect(operation.responses['500']?.['x-agent-workbench-error-codes']).toEqual([
      'internal_error'
    ]);
    expect(openApi.components.schemas.PublicApiErrorDetail.properties?.code.enum).toEqual([
      'missing_api_key',
      'invalid_api_key',
      'insufficient_scope',
      'internal_error'
    ]);
  });

  it('keeps the real server success response inside the checked-in schema', async () => {
    const serverClient = { source: 'contract-test' };
    routeSdk.createServerSupabaseClient.mockReturnValue(serverClient);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMatchesSchema(payload, responseSchema(200));
    expect(payload).toEqual({ data: [agent] });
    expect(routeSdk.authenticate).toHaveBeenCalledWith(
      'awb_live_test',
      'agents:read',
      serverClient
    );
  });

  it('keeps the real server error codes mapped to their documented HTTP statuses', async () => {
    const cases = [
      {
        status: 401,
        code: 'missing_api_key',
        configure: () => routeSdk.parseBearerApiKey.mockReturnValue(null)
      },
      {
        status: 401,
        code: 'invalid_api_key',
        configure: () => routeSdk.authenticate.mockRejectedValue(new Error('Invalid API key'))
      },
      {
        status: 403,
        code: 'insufficient_scope',
        configure: () => routeSdk.authenticate.mockRejectedValue(new Error('API key scope denied'))
      },
      {
        status: 500,
        code: 'internal_error',
        configure: () => routeSdk.authenticate.mockRejectedValue(new Error('database unavailable'))
      }
    ];

    for (const testCase of cases) {
      resetRouteMocks();
      testCase.configure();

      const response = await GET(request());
      const payload = await response.json();

      expect(response.status).toBe(testCase.status);
      expect(payload).toMatchObject({ error: { code: testCase.code } });
      assertMatchesSchema(payload, responseSchema(testCase.status));
      expect(
        listAgentsOperation().responses[String(testCase.status)]?.['x-agent-workbench-error-codes']
      ).toContain(testCase.code);
    }
  });

  it('keeps SDK success data and PublicApiAgent aligned with the OpenAPI agent schema', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [agent] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const client = createAgentWorkbenchClient({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_test',
      fetch: fetchMock
    });

    const agents = await client.agents.list();

    expect(agents).toEqual([agent]);
    agents.forEach((item) => assertMatchesSchema(
      item,
      openApi.components.schemas.PublicApiAgent
    ));
  });

  it('keeps SDK error status and code preservation aligned with the server contract', async () => {
    const cases = [
      [401, 'missing_api_key'],
      [401, 'invalid_api_key'],
      [403, 'insufficient_scope'],
      [500, 'internal_error']
    ] as const;

    for (const [status, code] of cases) {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        error: { code, message: `contract:${code}` }
      }), { status }));
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
      expect(captured).toMatchObject({ status, code });
    }
  });

  it('keeps CLI --json output equal to the SDK public agent shape', async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const createClient = vi.fn(() => ({
      agents: { list: vi.fn(async () => [agent]) }
    }));

    const exitCode = await runCli(['agents', 'list', '--json'], {
      env: {
        AGENT_WORKBENCH_API_KEY: 'awb_live_test',
        AGENT_WORKBENCH_BASE_URL: 'https://workbench.example.com'
      },
      stdout: stdout.stream,
      stderr: stderr.stream,
      createClient
    });
    const payload = JSON.parse(stdout.read()) as unknown[];

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe('');
    expect(payload).toEqual([agent]);
    payload.forEach((item) => assertMatchesSchema(
      item,
      openApi.components.schemas.PublicApiAgent
    ));
  });
});
