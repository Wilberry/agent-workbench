const activeRuns = new Map<string, AbortController>();

export function registerActiveAgentRun(runId: string, controller: AbortController): () => void {
  const previous = activeRuns.get(runId);
  if (previous && previous !== controller) {
    previous.abort('Execution ownership moved to another runner');
  }
  activeRuns.set(runId, controller);

  return () => {
    if (activeRuns.get(runId) === controller) activeRuns.delete(runId);
  };
}

export function abortActiveAgentRun(runId: string, reason = 'Agent run cancelled'): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  if (!controller.signal.aborted) controller.abort(reason);
  return true;
}
