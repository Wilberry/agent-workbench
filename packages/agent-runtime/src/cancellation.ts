import {
  abortActiveAgentRun,
  registerActiveAgentRun
} from '@agent-workbench/sdk';

export class AgentExecutionCancelledError extends Error {
  code = 'AGENT_EXECUTION_CANCELLED';

  constructor(public readonly reason: string = 'Agent execution cancelled') {
    super(reason);
    this.name = 'AgentExecutionCancelledError';
  }
}

export function cancellationReason(signal?: AbortSignal): string {
  if (!signal?.aborted) return 'Agent execution cancelled';
  const reason = signal.reason;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  if (reason instanceof Error && reason.message) return reason.message;
  return 'Agent execution cancelled';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AgentExecutionCancelledError(cancellationReason(signal));
  }
}

export function isAgentExecutionCancelledError(error: unknown): error is AgentExecutionCancelledError {
  const visited = new Set<unknown>();
  let candidate: unknown = error;

  while (candidate && typeof candidate === 'object' && !visited.has(candidate)) {
    visited.add(candidate);
    if (candidate instanceof AgentExecutionCancelledError) return true;
    const record = candidate as { code?: unknown; cause?: unknown; message?: unknown };
    if (record.code === 'AGENT_EXECUTION_CANCELLED') return true;
    if (record.message === 'agent_run_cancelled') return true;
    candidate = record.cause;
  }

  return false;
}

export const registerActiveRun = registerActiveAgentRun;
export const abortActiveRun = abortActiveAgentRun;
