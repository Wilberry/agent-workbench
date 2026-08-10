import type { LLMResponse, LLMStreamEvent } from './types';

export class LLMStreamProtocolError extends Error {
  code = 'LLM_STREAM_PROTOCOL_ERROR';

  constructor(
    public readonly provider: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${provider} stream protocol error: ${message}`, options);
    this.name = 'LLMStreamProtocolError';
  }
}

export async function collectLLMStream(
  events: AsyncIterable<LLMStreamEvent>,
  onEvent?: (event: LLMStreamEvent) => void | Promise<void>
): Promise<LLMResponse> {
  let finalResponse: LLMResponse | undefined;

  for await (const event of events) {
    await onEvent?.(event);
    if (event.type === 'response_end') {
      finalResponse = event.response;
    }
  }

  if (!finalResponse) {
    throw new LLMStreamProtocolError('unknown', 'stream ended without a response_end event');
  }

  return finalResponse;
}
