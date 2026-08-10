import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chatCompletion,
  LLMToolArgumentsError,
  type LLMToolDefinition
} from '@agent-workbench/agent-runtime';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

const weatherTool: LLMToolDefinition = {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string' }
    },
    required: ['city']
  }
};

afterEach(() => {
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;

  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenAI native tool contract', () => {
  it('normalizes a native function call and round-trips its tool result', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_weather_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"Athens"}'
              }
            }]
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'It is sunny in Athens.' }
        }],
        usage: { prompt_tokens: 130, completion_tokens: 10, total_tokens: 140 }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await chatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'What is the weather in Athens?' }],
      tools: [weatherTool],
      tool_choice: 'required'
    });

    expect(first.stop_reason).toBe('tool_use');
    expect(first.tool_calls).toEqual([{
      id: 'call_weather_1',
      name: 'get_weather',
      arguments: { city: 'Athens' }
    }]);

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools).toEqual([{
      type: 'function',
      function: {
        name: 'get_weather',
        description: weatherTool.description,
        parameters: weatherTool.input_schema
      }
    }]);
    expect(firstBody.tool_choice).toBe('required');

    const second = await chatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'What is the weather in Athens?' },
        { role: 'assistant', content: '', tool_calls: first.tool_calls },
        {
          role: 'tool',
          content: '{"temperature_c":31,"condition":"sunny"}',
          tool_call_id: 'call_weather_1',
          name: 'get_weather'
        }
      ],
      tools: [weatherTool]
    });

    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(secondBody.messages).toEqual([
      { role: 'user', content: 'What is the weather in Athens?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_weather_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city":"Athens"}'
          }
        }]
      },
      {
        role: 'tool',
        content: '{"temperature_c":31,"condition":"sunny"}',
        tool_call_id: 'call_weather_1'
      }
    ]);
    expect(second.content).toBe('It is sunny in Athens.');
    expect(second.stop_reason).toBe('stop');
  });

  it('rejects malformed provider-generated JSON arguments', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'gpt-4o-mini',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{
            id: 'call_bad',
            type: 'function',
            function: { name: 'get_weather', arguments: '{bad json' }
          }]
        }
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }), { status: 200 }))));

    await expect(chatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [weatherTool]
    })).rejects.toBeInstanceOf(LLMToolArgumentsError);
  });
});

describe('Anthropic native tool contract', () => {
  it('normalizes tool_use and groups neutral tool results into tool_result blocks', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'msg_tool_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [
          { type: 'text', text: 'I will check.' },
          {
            type: 'tool_use',
            id: 'toolu_weather_1',
            name: 'get_weather',
            input: { city: 'Athens' }
          }
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 20 }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'msg_tool_2',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'It is sunny in Athens.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 130, output_tokens: 10 }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await chatCompletion({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'What is the weather in Athens?' }],
      tools: [weatherTool],
      tool_choice: 'required'
    });

    expect(first.content).toBe('I will check.');
    expect(first.stop_reason).toBe('tool_use');
    expect(first.tool_calls).toEqual([{
      id: 'toolu_weather_1',
      name: 'get_weather',
      arguments: { city: 'Athens' }
    }]);

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools).toEqual([{
      name: 'get_weather',
      description: weatherTool.description,
      input_schema: weatherTool.input_schema
    }]);
    expect(firstBody.tool_choice).toEqual({ type: 'any' });

    const second = await chatCompletion({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'user', content: 'What is the weather in Athens?' },
        { role: 'assistant', content: first.content, tool_calls: first.tool_calls },
        {
          role: 'tool',
          content: '{"temperature_c":31,"condition":"sunny"}',
          tool_call_id: 'toolu_weather_1',
          name: 'get_weather'
        }
      ],
      tools: [weatherTool]
    });

    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(secondBody.messages).toEqual([
      { role: 'user', content: 'What is the weather in Athens?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will check.' },
          {
            type: 'tool_use',
            id: 'toolu_weather_1',
            name: 'get_weather',
            input: { city: 'Athens' }
          }
        ]
      },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_weather_1',
          content: '{"temperature_c":31,"condition":"sunny"}'
        }]
      }
    ]);
    expect(second.content).toBe('It is sunny in Athens.');
    expect(second.stop_reason).toBe('stop');
  });
});
