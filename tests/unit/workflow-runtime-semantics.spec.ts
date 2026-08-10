import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutionCancelledError,
  executeLLMToolLoop,
  getRunCheckpoint,
  isAgentExecutionCancelledError,
  LLMToolCheckpointError,
  LLMToolContinuationError,
  LLMToolExecutionError,
  rebuildWorkflowEpisode,
  requestWithProviderReliability,
  type LLMRequest,
  type LLMResponse,
  type LLMToolDefinition,
  type LLMToolLoopCheckpoint
} from '@agent-workbench/agent-runtime';

const tool: LLMToolDefinition = {
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
  description: 'Get agent info.',
  input_schema: { type: 'object', properties: {} }
};

function response(overrides: Partial<LLMResponse> = {}): LLMResponse {
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

describe('provider cancellation ownership', () => {
  it('does not retry an explicitly cancelled provider request', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort('user cancelled run');
      throw new Error('fetch aborted');
    }) as unknown as typeof fetch;

    await expect(requestWithProviderReliability(
      'openai',
      'https://provider.invalid',
      { method: 'POST' },
      {
        signal: controller.signal,
        maxRetries: 3,
        fetchImpl,
        sleep: async () => {}
      }
    )).rejects.toMatchObject({
      code: 'AGENT_EXECUTION_CANCELLED',
      message: 'user cancelled run'
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('recognizes cancellation through a continuation wrapper', () => {
    const wrapped = new LLMToolContinuationError(
      1,
      new AgentExecutionCancelledError('cancelled during continuation'),
      true
    );
    expect(isAgentExecutionCancelledError(wrapped)).toBe(true);
  });
});

describe('tool-loop resumability boundary', () => {
  it('observes cancellation after a model response before any tool side effect', async () => {
    const controller = new AbortController();
    const complete = vi.fn(async (_request: LLMRequest) => response({
      stop_reason: 'tool_use',
      tool_calls: [{ id: 'call_1', name: 'search_memory', arguments: { query: 'alpha' } }]
    }));
    const executeTool = vi.fn(async () => ({ ok: true }));

    await expect(executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'search' }],
      tools: [tool],
      signal: controller.signal,
      complete,
      executeTool,
      onModelResponse() {
        controller.abort('cancel before tool');
      }
    })).rejects.toMatchObject({ code: 'AGENT_EXECUTION_CANCELLED' });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it('marks provider continuation resumable only after the checkpoint persisted', async () => {
    const complete = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce(response({
        stop_reason: 'tool_use',
        tool_calls: [{ id: 'call_1', name: 'search_memory', arguments: { query: 'alpha' } }]
      }))
      .mockRejectedValueOnce(new Error('provider follow-up unavailable'));
    const executeTool = vi.fn(async () => ({ matches: 2 }));
    let persisted: LLMToolLoopCheckpoint | undefined;

    let captured: unknown;
    try {
      await executeLLMToolLoop({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'search' }],
        tools: [tool],
        complete,
        executeTool,
        async onCheckpoint(checkpoint) {
          persisted = checkpoint;
        }
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMToolContinuationError);
    expect((captured as LLMToolContinuationError).resumeSafe).toBe(true);
    expect((captured as LLMToolContinuationError).checkpoint).toEqual(persisted);
    expect(persisted?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'call_1' })
    ]));
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('resumes from a persisted checkpoint without replaying the completed tool', async () => {
    const firstComplete = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce(response({
        stop_reason: 'tool_use',
        tool_calls: [{ id: 'call_1', name: 'search_memory', arguments: { query: 'alpha' } }]
      }))
      .mockRejectedValueOnce(new Error('continuation unavailable'));
    const firstExecuteTool = vi.fn(async () => ({ matches: 2 }));
    let checkpoint: LLMToolLoopCheckpoint | undefined;

    await expect(executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'search' }],
      tools: [tool],
      complete: firstComplete,
      executeTool: firstExecuteTool,
      onCheckpoint(value) {
        checkpoint = value;
      }
    })).rejects.toBeInstanceOf(LLMToolContinuationError);

    expect(checkpoint).toBeDefined();
    const resumedComplete = vi.fn(async (request: LLMRequest) => {
      expect(request.messages).toEqual(checkpoint?.messages);
      return response({
        content: 'Finished from persisted tool result.',
        prompt_tokens: 20,
        completion_tokens: 8,
        total_tokens: 28,
        estimated_cost: 0.002,
        latency_ms: 30,
        stop_reason: 'stop'
      });
    });
    const replayedTool = vi.fn(async () => ({ shouldNotRun: true }));

    const result = await executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ignored because checkpoint owns state' }],
      tools: [tool],
      resumeFrom: checkpoint!,
      complete: resumedComplete,
      executeTool: replayedTool
    });

    expect(replayedTool).not.toHaveBeenCalled();
    expect(result.content).toBe('Finished from persisted tool result.');
    expect(result.toolsCalled).toEqual(['search_memory']);
    expect(result.modelIterations).toBe(2);
    expect(result.total_tokens).toBe(43);
    expect(result.estimated_cost).toBeCloseTo(0.003);
  });

  it('makes checkpoint persistence failure terminal after a completed tool', async () => {
    const complete = vi.fn(async (_request: LLMRequest) => response({
      stop_reason: 'tool_use',
      tool_calls: [{ id: 'call_1', name: 'search_memory', arguments: { query: 'alpha' } }]
    }));
    const executeTool = vi.fn(async () => ({ matches: 1 }));

    await expect(executeLLMToolLoop({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'search' }],
      tools: [tool],
      complete,
      executeTool,
      onCheckpoint() {
        throw new Error('database unavailable');
      }
    })).rejects.toBeInstanceOf(LLMToolCheckpointError);

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps partial multi-tool failure terminal and emits no resumable checkpoint', async () => {
    const complete = vi.fn(async (_request: LLMRequest) => response({
      stop_reason: 'tool_use',
      tool_calls: [
        { id: 'call_1', name: 'search_memory', arguments: { query: 'alpha' } },
        { id: 'call_2', name: 'get_agent_info', arguments: {} }
      ]
    }));
    const executeTool = vi.fn(async (name: string) => {
      if (name === 'get_agent_info') throw new Error('second tool failed');
      return { ok: true };
    });
    const onCheckpoint = vi.fn();

    let captured: unknown;
    try {
      await executeLLMToolLoop({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'use tools' }],
        tools: [tool, infoTool],
        complete,
        executeTool: executeTool as any,
        onCheckpoint
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMToolExecutionError);
    expect((captured as LLMToolExecutionError).completedToolCalls).toBe(1);
    expect(onCheckpoint).not.toHaveBeenCalled();
  });
});

describe('durable trace ownership', () => {
  it('restores prior workflow output and the latest step checkpoint', () => {
    const checkpoint: LLMToolLoopCheckpoint = {
      version: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'continuation' }],
      toolRounds: 1,
      toolsCalled: ['search_memory'],
      completedToolCalls: 1,
      modelIterations: 1,
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      estimated_cost: 0.001,
      latency_ms: 20,
      provider_name: 'openai',
      model_name: 'gpt-4o-mini',
      stop_reason: 'tool_use',
      legacyFallbackUsed: false
    };
    const trace = [
      {
        step: 'planner',
        status: 'completed',
        output: 'Plan output',
        metadata: { stepIndex: 0 }
      },
      {
        step: 'checkpoint',
        status: 'completed',
        metadata: { stepIndex: 1, role: 'Executor', checkpoint }
      },
      {
        step: 'executor',
        status: 'failed',
        output: '',
        metadata: { stepIndex: 1 }
      }
    ];

    expect(rebuildWorkflowEpisode(trace, 1)).toEqual([
      'PLANNER OUTPUT:\nPlan output'
    ]);
    expect(getRunCheckpoint(trace, 1, 'Executor')).toEqual(checkpoint);
  });
});
