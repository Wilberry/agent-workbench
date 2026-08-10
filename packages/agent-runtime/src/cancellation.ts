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
  if (error instanceof AgentExecutionCancelledError) return true;
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === 'AGENT_EXECUTION_CANCELLED';
}

const activeRuns = new Map<string, AbortController>();

export function registerActiveRun(runId: string, controller: AbortController): () => void {
  const previous = activeRuns.get(runId);
  if (previous && previous !== controller) {
    previous.abort('Execution ownership moved to another runner');
  }
  activeRuns.set(runId, controller);

  return () => {
    if (activeRuns.get(runId) === controller) activeRuns.delete(runId);
  };
}

export function abortActiveRun(runId: string, reason = 'Agent run cancelled'): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  if (!controller.signal.aborted) controller.abort(reason);
  return true;
}
