'use client';

type ExecutionStep = {
  id: string;
  run_id?: string;
  step: 'planner' | 'executor' | 'reviewer' | 'tool' | 'memory' | 'error' | string;
  status: 'started' | 'completed' | 'failed' | string;
  input?: any;
  output?: any;
  error?: string;
  timestamp: string;
  metadata?: { model?: string; tokens?: number; toolName?: string } | null;
};

type Props = {
  steps: ExecutionStep[];
  isRunning: boolean;
};

export default function ExecutionTraceTimeline({ steps, isRunning }: Props) {
  return (
    <div className="space-y-3">
      {steps.length === 0 ? (
        <div className="text-sm text-slate-400">No execution steps yet.</div>
      ) : (
        steps.map((step) => (
          <details
              key={step.id}
            className="rounded-2xl border border-slate-700 bg-slate-900"
            open={steps.length === 1}
          >
            <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-100">
              <div className="flex items-center justify-between">
                <div>
                    <span className="text-emerald-400">{step.step}</span>
                    {step.status === 'failed' && (
                    <span className="ml-2 inline-block rounded bg-red-900 px-2 py-1 text-xs text-red-100">
                      Failed
                    </span>
                  )}
                    {step.status === 'completed' && (
                    <span className="ml-2 inline-block rounded bg-emerald-900 px-2 py-1 text-xs text-emerald-100">
                      Completed
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </summary>

            <div className="space-y-3 border-t border-slate-700 px-4 py-3">
              {step.input && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-300">Input:</div>
                  <div className="rounded bg-slate-950 p-2 text-sm text-slate-100">{step.input}</div>
                </div>
              )}

              {step.output && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-300">Output:</div>
                  <div className="rounded bg-slate-950 p-2 text-sm text-slate-100 whitespace-pre-wrap">
                    {step.output}
                  </div>
                </div>
              )}

              {step.error && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-red-400">Error:</div>
                  <div className="rounded bg-red-950 p-2 text-sm text-red-100">{step.error}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div>
                  <div className="font-semibold">Tools:</div>
                  <div>{step.metadata?.toolName ?? 'None'}</div>
                </div>
                <div>
                  <div className="font-semibold">Iterations:</div>
                  <div>{step.metadata?.tokens ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="font-semibold">Memory used:</div>
                  <div>{step.metadata?.model ? 'Yes' : 'Unknown'}</div>
                </div>
                <div>
                  <div className="font-semibold">Status:</div>
                  <div>{step.status || 'pending'}</div>
                </div>
              </div>
            </div>
          </details>
        ))
      )}

      {isRunning && (
        <div className="rounded-2xl border border-emerald-700 bg-emerald-950 px-4 py-3">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
            <div className="text-sm text-emerald-100">Workflow running...</div>
          </div>
        </div>
      )}
    </div>
  );
}
