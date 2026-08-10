import type { LLMResponse, LLMStreamEvent } from './types';

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
    throw new Error('LLM stream ended without a response_end event');
  }

  return finalResponse;
}
