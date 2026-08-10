import type { LLMToolCall } from './types';

export class LLMToolArgumentsError extends Error {
  code = 'LLM_TOOL_ARGUMENTS_ERROR';

  constructor(
    public readonly provider: string,
    public readonly toolCallId: string,
    public readonly toolName: string,
    message: string,
    public readonly rawArguments: unknown
  ) {
    super(message);
    this.name = 'LLMToolArgumentsError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeToolArguments(
  provider: string,
  toolCallId: string,
  toolName: string,
  rawArguments: unknown
): Record<string, unknown> {
  let parsed = rawArguments;

  if (typeof rawArguments === 'string') {
    try {
      parsed = JSON.parse(rawArguments);
    } catch (error) {
      throw new LLMToolArgumentsError(
        provider,
        toolCallId,
        toolName,
        `Invalid JSON arguments for tool ${toolName}`,
        rawArguments
      );
    }
  }

  if (!isRecord(parsed)) {
    throw new LLMToolArgumentsError(
      provider,
      toolCallId,
      toolName,
      `Tool arguments for ${toolName} must be a JSON object`,
      rawArguments
    );
  }

  return parsed;
}

export function normalizeToolCall(params: {
  provider: string;
  id: string;
  name: string;
  arguments: unknown;
}): LLMToolCall {
  if (!params.id) {
    throw new LLMToolArgumentsError(
      params.provider,
      '',
      params.name,
      `Tool call for ${params.name || 'unknown tool'} is missing an id`,
      params.arguments
    );
  }
  if (!params.name) {
    throw new LLMToolArgumentsError(
      params.provider,
      params.id,
      '',
      'Tool call is missing a name',
      params.arguments
    );
  }

  return {
    id: params.id,
    name: params.name,
    arguments: normalizeToolArguments(
      params.provider,
      params.id,
      params.name,
      params.arguments
    )
  };
}
