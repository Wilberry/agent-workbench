import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeLLMToolLoop,
  LLMProviderRequestError,
  streamChatCompletion,
  type LLMRequest,
  type LLMResponse,
  type LLMStreamEvent,
  type LLMToolDefinition
} from '@agent-workbench/agent-runtime';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalMockOpenAI = process.env.USE_MOCK_OPENAI;

const weatherTool: LLMToolDefinition = {
  name: 'get_weather',
  description: 'Get weather for a city.',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city']
  }
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv('OPENAI_API_KEY', originalOpenAIKey);
  restoreEnv('ANTHROPIC_API_KEY', originalAnthropicKey);
  restoreEnv('USE_MOCK_OPENAI', originalMockOpenAI);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function chunkedResponse(parts: string[], status = 200, headers: HeadersInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    }
  });
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'text/event-stream');
  return new Response(body, { status, headers: responseHeaders });
}

async function collect(events: AsyncIterable<LLMStreamEvent>): Promise<LLMStreamEvent[]> {
  const result: LLMStreamEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe('OpenAI provider streaming', () => {
  it('normalizes text, incremental tool arguments, usage, and final response across chunk boundaries', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const wire = [
      'data: {"id":"chatcmpl_stream","model":"gpt-4o-mini","choices":[{"delta":{"content":"Checking"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream","model":"gpt-4o-mini","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_weather_1","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":\\"Ath"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream","model":"gpt-4o-mini","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ens\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: {"id":"chatcmpl_stream","model":"gpt-4o-mini","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}\n\n',
      'data: [DONE]\n\n'
    ].join('');

    const parts = [wire.slice(0, 37), wire.slice(37, 121), wire.slice(121, 284), wire.slice(284)];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => chunkedResponse(parts));
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(streamChatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Weather in Athens?' }],
      tools: [weatherTool],
      tool_choice: 'required'
    }));

    expect(events.map((event) => event.type)).toEqual([
      'response_start',
      'text_delta',
      'tool_call_start',
      'tool_call_delta',
      'tool_call_delta',
      'tool_call_end',
      'usage',
      'response_end'
    ]);
    expect(events.find((event) => event.type === 'text_delta')).toEqual({
      type: 'text_delta',
      delta: 'Checking'
    });
    expect(events.filter((event) => event.type === 'tool_call_delta')).toEqual([
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'call_weather_1',
        arguments_delta: '{"city":"Ath'
      },
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'call_weather_1',
        arguments_delta: 'ens"}'
      }
    ]);

    const toolEnd = events.find((event) => event.type === 'tool_call_end');
    expect(toolEnd).toEqual({
      type: 'tool_call_end',
      index: 0,
      call: {
        id: 'call_weather_1',
        name: 'get_weather',
        arguments: { city: 'Athens' }
      }
    });

    const usage = events.find((event) => event.type === 'usage');
    expect(usage).toEqual(expect.objectContaining({
      type: 'usage',
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
    }));

    const end = events.find((event) => event.type === 'response_end');
    expect(end).toEqual(expect.objectContaining({
      type: 'response_end',
      response: expect.objectContaining({
        content: 'Checking',
        stop_reason: 'tool_use',
        tool_calls: [{
          id: 'call_weather_1',
          name: 'get_weather',
          arguments: { city: 'Athens' }
        }],
        total_tokens: 14
      })
    }));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.tool_choice).toBe('required');
  });

  it('retries a transient failure only before the first streamed byte', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const success = [
      'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
      'data: {"model":"gpt-4o-mini","choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      'data: [DONE]\n\n'
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': '0' }
      }))
      .mockResolvedValueOnce(chunkedResponse(success));
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(streamChatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      max_retries: 1
    }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.find((event) => event.type === 'text_delta')).toEqual({
      type: 'text_delta',
      delta: 'ok'
    });
  });

  it('does not replay a stream after any bytes were emitted', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const encoder = new TextEncoder();
    let pulled = 0;
    const failingBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled === 1) {
          controller.enqueue(encoder.encode(
            'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n'
          ));
          return;
        }
        controller.error(new Error('connection reset'));
      }
    });
    const fetchMock = vi.fn(async () => new Response(failingBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const seen: LLMStreamEvent[] = [];
    let captured: unknown;
    try {
      for await (const event of streamChatCompletion({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
        max_retries: 2
      })) {
        seen.push(event);
      }
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMProviderRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).toContainEqual({ type: 'text_delta', delta: 'partial' });
  });
});

describe('Anthropic provider streaming', () => {
  it('normalizes text, input_json_delta tool arguments, usage, and stop reason', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const wire = [
      'data: {"type":"message_start","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":8,"output_tokens":0}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_weather_1","name":"get_weather","input":{}}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Ath"}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"ens\\"}"}}\n\n',
      'data: {"type":"content_block_stop","index":1}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}\n\n',
      'data: {"type":"message_stop"}\n\n'
    ].join('');

    const parts = [wire.slice(0, 19), wire.slice(19, 203), wire.slice(203, 421), wire.slice(421)];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => chunkedResponse(parts));
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(streamChatCompletion({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Weather in Athens?' }],
      tools: [weatherTool],
      tool_choice: 'required'
    }));

    expect(events.map((event) => event.type)).toEqual([
      'response_start',
      'text_delta',
      'tool_call_start',
      'tool_call_delta',
      'tool_call_delta',
      'tool_call_end',
      'usage',
      'response_end'
    ]);
    expect(events.find((event) => event.type === 'text_delta')).toEqual({
      type: 'text_delta',
      delta: 'Checking'
    });
    expect(events.find((event) => event.type === 'tool_call_end')).toEqual({
      type: 'tool_call_end',
      index: 1,
      call: {
        id: 'toolu_weather_1',
        name: 'get_weather',
        arguments: { city: 'Athens' }
      }
    });
    expect(events.find((event) => event.type === 'usage')).toEqual(expect.objectContaining({
      type: 'usage',
      usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 }
    }));
    expect(events.find((event) => event.type === 'response_end')).toEqual(expect.objectContaining({
      type: 'response_end',
      response: expect.objectContaining({
        content: 'Checking',
        stop_reason: 'tool_use',
        total_tokens: 13
      })
    }));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.stream).toBe(true);
    expect(body.tool_choice).toEqual({ type: 'any' });
  });
});

describe('stream client compatibility and shared tool loop integration', () => {
  it('synthesizes normalized stream events for a buffered-only provider', async () => {
    process.env.USE_MOCK_OPENAI = 'true';
    delete process.env.OPENAI_API_KEY;

    const events = await collect(streamChatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }]
    }));

    expect(events.map((event) => event.type)).toEqual([
      'response_start',
      'text_delta',
      'usage',
      'response_end'
    ]);
    expect(events[0]).toEqual(expect.objectContaining({
      type: 'response_start',
      provider_name: 'mock'
    }));
  });

  it('streams each provider iteration through one native tool loop', async () => {
    const firstResponse: LLMResponse = {
      content: 'I will use a tool.',
      provider_name: 'test',
      model_name: 'test-model',
      prompt_tokens: 2,
      completion_tokens: 1,
      total_tokens: 3,
      latency_ms: 4,
      estimated_cost: 0,
      tool_calls: [{ id: 'call_1', name: 'get_weather', arguments: { city: 'Athens' } }],
      stop_reason: 'tool_use'
    };
    const secondResponse: LLMResponse = {
      content: 'Sunny.',
      provider_name: 'test',
      model_name: 'test-model',
      prompt_tokens: 3,
      completion_tokens: 1,
      total_tokens: 4,
      latency_ms: 5,
      estimated_cost: 0,
      stop_reason: 'stop'
    };

    const makeStream = (response: LLMResponse): AsyncIterable<LLMStreamEvent> => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'response_start', provider_name: 'test', model_name: 'test-model' };
        if (response.content) yield { type: 'text_delta', delta: response.content };
        for (const [index, call] of (response.tool_calls ?? []).entries()) {
          yield { type: 'tool_call_start', index, id: call.id, name: call.name };
          yield { type: 'tool_call_end', index, call };
        }
        yield {
          type: 'usage',
          usage: {
            prompt_tokens: response.prompt_tokens,
            completion_tokens: response.completion_tokens,
            total_tokens: response.total_tokens
          },
          estimated_cost: response.estimated_cost
        };
        yield { type: 'response_end', response };
      }
    });

    const streams = [makeStream(firstResponse), makeStream(secondResponse)];
    const stream = vi.fn((_request: LLMRequest) => streams.shift()!);
    const complete = vi.fn(async () => {
      throw new Error('buffered completion should not run');
    });
    const executeTool = vi.fn(async () => ({ condition: 'sunny' }));
    const seen: Array<{ iteration: number; type: LLMStreamEvent['type'] }> = [];

    const result = await executeLLMToolLoop({
      provider: 'test',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [weatherTool],
      stream,
      complete,
      executeTool,
      onStreamEvent(event, context) {
        seen.push({ iteration: context.modelIteration, type: event.type });
      }
    });

    expect(result.content).toBe('Sunny.');
    expect(result.modelIterations).toBe(2);
    expect(result.total_tokens).toBe(7);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(complete).not.toHaveBeenCalled();
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(seen.some((item) => item.iteration === 1 && item.type === 'tool_call_end')).toBe(true);
    expect(seen.some((item) => item.iteration === 2 && item.type === 'text_delta')).toBe(true);
  });
});
