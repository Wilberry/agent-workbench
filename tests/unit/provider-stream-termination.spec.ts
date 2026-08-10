import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LLMStreamProtocolError,
  streamChatCompletion
} from '@agent-workbench/agent-runtime';

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function streamResponse(payloads: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

afterEach(() => {
  restoreEnv('OPENAI_API_KEY', originalOpenAIKey);
  restoreEnv('ANTHROPIC_API_KEY', originalAnthropicKey);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider stream terminal markers', () => {
  it('rejects a clean OpenAI EOF without [DONE]', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const fetchMock = vi.fn(async () => streamResponse([
      JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [{ delta: { content: 'partial' }, finish_reason: 'stop' }]
      })
    ]));
    vi.stubGlobal('fetch', fetchMock);

    let captured: unknown;
    try {
      for await (const _event of streamChatCompletion({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
        max_retries: 2
      })) {
        // consume until the protocol validator rejects the incomplete stream
      }
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMStreamProtocolError);
    expect((captured as LLMStreamProtocolError).provider).toBe('openai');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a clean Anthropic EOF without message_stop', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    const fetchMock = vi.fn(async () => streamResponse([
      JSON.stringify({
        type: 'message_start',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1, output_tokens: 0 }
        }
      }),
      JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      }),
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'partial' }
      }),
      JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 }
      })
    ]));
    vi.stubGlobal('fetch', fetchMock);

    let captured: unknown;
    try {
      for await (const _event of streamChatCompletion({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'hello' }],
        max_retries: 2
      })) {
        // consume until the protocol validator rejects the incomplete stream
      }
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LLMStreamProtocolError);
    expect((captured as LLMStreamProtocolError).provider).toBe('anthropic');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
