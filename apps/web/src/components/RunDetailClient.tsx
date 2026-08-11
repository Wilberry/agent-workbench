'use client';

import { useEffect, useState } from 'react';
import { subscribeToRunEvents } from '@agent-workbench/sdk';
import ExecutionTraceTimeline from './ExecutionTraceTimeline';

type ExecutionStep = {
  id: string;
  run_id?: string;
  step: string;
  status: string;
  input?: any;
  output?: any;
  error?: string;
  timestamp: string;
  metadata?: { model?: string; tokens?: number; toolName?: string } | null;
};

type Props = {
  runId: string;
  initialTrace?: ExecutionStep[];
  initialStatus?: string;
};

export default function RunDetailClient({ runId, initialTrace = [], initialStatus = 'running' }: Props) {
  const [steps, setSteps] = useState<ExecutionStep[]>(initialTrace);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const unsubscribe = subscribeToRunEvents(runId, (evt) => {
      if (evt.event === 'execution_step') {
        const step = evt.payload as ExecutionStep;
        setSteps((prev) => {
          const exists = prev.find((s) => s.id === step.id);
          if (exists) return prev.map((s) => (s.id === step.id ? step : s));
          return [...prev, step];
        });
      } else if (evt.event === 'run_completed') {
        setStatus('completed');
      } else if (evt.event === 'run_failed') {
        setStatus('failed');
      } else if (evt.event === 'run_cancelled') {
        setStatus('cancelled');
      }
    });

    return () => unsubscribe();
  }, [runId]);

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-300">Execution Timeline</div>
      <ExecutionTraceTimeline steps={steps} isRunning={status === 'running'} />
    </div>
  );
}
