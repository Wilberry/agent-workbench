import { describe, expect, it, vi } from 'vitest';
import {
  executeLLMToolLoop,
  getBuiltInToolDefinitions,
  LLMToolContinuationError,
  LLMToolExecutionError,
  LLMToolLoopLimitError,
  LLMToolNotAllowedError,
  resolveExecutionToolDefinitions,
  type LLMRequest,
  type LLMResponse,
  type LLMToolDefinition
} from '@agent-workbench/agent-runtime';

const searchTool: LLMToolDefinition = {
  name: 'search_memory',
  description: 'Search memory.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  }
};

const infoTool: LLMToolDefinition = {
  name: 'get_agent_info',
  description: 'Get agent information.',
  input_schema: { type: 'object', properties: {} }
};

function response(overrides: Partial<LLMResponse>): LLMResponse {
  return {
    content: '',
    provider_name: 'openai',
    model_name: 'gpt-4o-mini',
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    latency_ms: 20,
    estimated_cost: 0.001,
    ...overrides
  };
}

describe('shared native tool execution loop', () => {
  it('executes multiple native calls before one provider follow-up', async () => {
    const complete = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce(response({
        stop_reason: 'tool_use',
        tool_calls: [
          { id: 'call_1', name: 'search_memory', arguments: { query: 'alpha' } },
          { id: 'call_2', name: 'get_agent_info', arguments: {} }
        ]
      }))
      .mockResolvedValueOnce(response({
        content: 'Finished with both tool results.',
        prompt_tokens: 20,
        completion_tokens: 8,
        total_tokens: 28,
        latency_ms: 30,
        estimated_cost: 0.002,
        stop_reason: 'stop'
      }));
    const executeTool = vi.fn(async (...args: any[]) => ({ ok: true, name: args[0] }));

    const result = await executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Use the tools.' }],
      tools: [searchTool, infoTool],
      ownerUserId: 'owner-1',
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      complete,
      executeTool
    });

    expect(result.content).toBe('Finished with both tool results.');
    expect(result.toolsCalled).toEqual(['search_memory', 'get_agent_info']);
    expect(result.modelIterations).toBe(2);
    expect(result.total_tokens).toBe(43);
    expect(result.estimated_cost).toBeCloseTo(0.003);
    expect(result.legacyFallbackUsed).toBe(false);
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(executeTool.mock.calls[0]?.[4]).toEqual({
      ownerUserId: 'owner-1',
      agentId: 'agent-1',
      conversationId: 'conversation-1'
    });
    expect(executeTool.mock.calls[1]?.[4]).toEqual({
      ownerUserId: 'owner-1',
      agentId: 'agent-1',
      conversationId: 'conversation-1'
    });

    const secondRequest = complete.mock.calls[1]![0];
    expect(secondRequest.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        tool_calls: expect.arrayContaining([
          expect.objectContaining({ id: 'call_1', name: 'search_memory' }),
          expect.objectContaining({ id: 'call_2', name: 'get_agent_info' })
        ])
      }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'call_1', name: 'search_memory' }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'call_2', name: 'get_agent_info' })
    ]));
  });

  it('keeps TOOL_CALL text as a compatibility fallback', async () => {
    const complete = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce(response({
        content: 'TOOL_CALL: {"name":"search_memory","args":{"query":"legacy"}}'
      }))
      .mockResolvedValueOnce(response({ content: 'Legacy fallback completed.' }));
    const executeTool = vi.fn(async (..._args: any[]) => ({ matches: 2 }));

    const result = await executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Use fallback.' }],
      tools: [searchTool],
      conversationId: 'conversation-legacy',
      complete,
      executeTool
    });

    expect(result.content).toBe('Legacy fallback completed.');
    expect(result.legacyFallbackUsed).toBe(true);
    expect(result.toolsCalled).toEqual(['search_memory']);
    expect(executeTool.mock.calls[0]?.[4]).toEqual({
      ownerUserId: undefined,
      agentId: undefined,
      conversationId: 'conversation-legacy'
    });

    const secondRequest = complete.mock.calls[1]![0];
    expect(secondRequest.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Tool search_memory executed')
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Continue the response using the tool result above.'
      })
    ]));
  });

  it('rejects an unpinned native call before any tool side effect', async () => {
    const complete = vi.fn(async () => response({
      stop_reason: 'tool_use',
      tool_calls: [{ id: 'call_bad', name: 'admin_only', arguments: {} }]
    }));
    const executeTool = vi.fn(async () => ({ shouldNotRun: true }));

    await expect(executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Try an unavailable tool.' }],
      tools: [searchTool],
      complete,
      executeTool
    })).rejects.toBeInstanceOf(LLMToolNotAllowedError);

    expect(executeTool).not.toHaveBeenCalled();
  });

  it('checkpoints billed model usage and wraps a partial multi-tool failure', async () => {
    const complete = vi.fn(async () => response({
      stop_reason: 'tool_use',
      tool_calls: [
        { id: 'call_1', name: 'search_memory', arguments: { query: 'first' } },
        { id: 'call_2', name: 'get_agent_info', arguments: {} }
      ]
    }));
    const executeTool = vi.fn(async (name: string) => {
      if (name === 'get_agent_info') throw new Error('downstream tool failed');
      return { ok: true };
    });
    const onModelResponse = vi.fn();

    let captured: unknown;
    try {
      await executeLLMToolLoop({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Call two tools.' }],
        tools: [searchTool, infoTool],
        complete,
        executeTool,
        onModelResponse
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMToolExecutionError);
    expect((captured as LLMToolExecutionError).toolName).toBe('get_agent_info');
    expect((captured as LLMToolExecutionError).completedToolCalls).toBe(1);
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(onModelResponse).toHaveBeenCalledTimes(1);
    expect(onModelResponse.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      total_tokens: 15,
      estimated_cost: 0.001,
      modelIterations: 1
    }));
  });

  it('does not replay a completed tool when provider continuation fails', async () => {
    const complete = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce(response({
        stop_reason: 'tool_use',
        tool_calls: [{ id: 'call_1', name: 'search_memory', arguments: { query: 'once' } }]
      }))
      .mockRejectedValueOnce(new Error('provider follow-up unavailable'));
    const executeTool = vi.fn(async () => ({ ok: true }));
    const onModelResponse = vi.fn();

    let captured: unknown;
    try {
      await executeLLMToolLoop({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Call then continue.' }],
        tools: [searchTool],
        complete,
        executeTool,
        onModelResponse
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMToolContinuationError);
    expect((captured as LLMToolContinuationError).completedToolCalls).toBe(1);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(onModelResponse).toHaveBeenCalledTimes(1);
  });

  it('does not execute another tool after the configured round limit', async () => {
    const complete = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce(response({
        stop_reason: 'tool_use',
        tool_calls: [{ id: 'call_1', name: 'search_memory', arguments: { query: 'one' } }]
      }))
      .mockResolvedValueOnce(response({
        stop_reason: 'tool_use',
        tool_calls: [{ id: 'call_2', name: 'search_memory', arguments: { query: 'two' } }]
      }));
    const executeTool = vi.fn(async () => ({ ok: true }));

    await expect(executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Keep calling tools.' }],
      tools: [searchTool],
      maxToolRounds: 1,
      complete,
      executeTool
    })).rejects.toBeInstanceOf(LLMToolLoopLimitError);

    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});

describe('version-pinned execution tool resolution', () => {
  it('preserves built-ins without exposing server-owned resource identifiers', async () => {
    const resolved = await resolveExecutionToolDefinitions({ versionTools: [] });
    expect(resolved.map((tool) => tool.name).sort()).toEqual(
      getBuiltInToolDefinitions().map((tool) => tool.name).sort()
    );

    const search = resolved.find((tool) => tool.name === 'search_memory');
    const summary = resolved.find((tool) => tool.name === 'summarize_conversation');
    const info = resolved.find((tool) => tool.name === 'get_agent_info');
    expect(JSON.stringify(search?.input_schema)).not.toContain('conversationId');
    expect(JSON.stringify(summary?.input_schema)).not.toContain('conversationId');
    expect(JSON.stringify(info?.input_schema)).not.toContain('agentId');
  });

  it('treats a non-empty version tool list as an allowlist', async () => {
    const resolved = await resolveExecutionToolDefinitions({
      versionTools: [{ name: 'search_memory' }]
    });
    expect(resolved.map((tool) => tool.name)).toEqual(['search_memory']);
  });

  it('prefers the matching tenant when registry slugs collide and excludes another private tenant', async () => {
    const rows = [
      {
        id: 'org-b-shared',
        org_id: 'org-b',
        name: 'Other Org Shared Search',
        slug: 'shared_search',
        description: 'Must not leak',
        entrypoint: 'https://org-b.invalid/tool',
        input_schema: { type: 'object', properties: {} },
        public: false,
        created_by: 'owner-b'
      },
      {
        id: 'public-shared',
        org_id: null,
        name: 'Public Shared Search',
        slug: 'shared_search',
        description: 'Public fallback',
        entrypoint: 'https://public.invalid/tool',
        input_schema: { type: 'object', properties: {} },
        public: true,
        created_by: 'publisher'
      },
      {
        id: 'org-a-shared',
        org_id: 'org-a',
        name: 'Org A Shared Search',
        slug: 'shared_search',
        description: 'Org A private search',
        entrypoint: 'https://org-a.invalid/tool',
        input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        public: false,
        created_by: 'owner-a'
      },
      {
        id: 'org-b-only',
        org_id: 'org-b',
        name: 'Other Org Tool',
        slug: 'other_org_tool',
        description: 'Must not leak',
        entrypoint: 'https://org-b.invalid/other',
        input_schema: { type: 'object', properties: {} },
        public: false,
        created_by: 'owner-b'
      }
    ];

    const fakeClient = {
      from(table: string) {
        expect(table).toBe('tools');
        return {
          select() {
            return {
              eq(field: string, value: string) {
                return {
                  async limit() {
                    return {
                      data: rows.filter((row) => (row as any)[field] === value),
                      error: null
                    };
                  }
                };
              }
            };
          }
        };
      }
    } as any;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = await resolveExecutionToolDefinitions({
      versionTools: [
        { slug: 'shared_search' },
        { slug: 'other_org_tool' }
      ],
      organizationId: 'org-a',
      ownerUserId: 'owner-a',
      client: fakeClient
    });

    expect(resolved.map((tool) => tool.name)).toEqual(['shared_search']);
    expect(resolved[0]?.description).toBe('Org A private search');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('other_org_tool'));
    warn.mockRestore();
  });
});
