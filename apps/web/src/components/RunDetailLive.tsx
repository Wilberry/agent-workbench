"use client";

import { useEffect, useMemo, useState } from 'react';
import { subscribeToRunEvents, subscribeToRun } from '@agent-workbench/sdk';
import ExecutionTraceTimeline from './ExecutionTraceTimeline';

type AgentRun = any;

type Props = {
  runId: string;
  initialRun: AgentRun;
  initialTrace?: any[];
};

export default function RunDetailLive({ runId, initialRun, initialTrace = [] }: Props) {
  const [run, setRun] = useState<AgentRun>(initialRun);
  const [steps, setSteps] = useState<any[]>(initialTrace);
  const [eventCount, setEventCount] = useState(0);
  const [connectionState, setConnectionState] = useState<'Connected' | 'Reconnecting' | 'Disconnected'>('Connected');
  const [lastEventAt, setLastEventAt] = useState<number>(Date.now());

  // derived metrics
  const stepCount = steps.length;
  const toolCallCount = useMemo(() => steps.filter((s) => s.metadata?.toolName).length, [steps]);
  const traceEventCount = eventCount;
  const completionPct = useMemo(() => {
    if (run?.workflow && Array.isArray(run.workflow) && run.workflow.length > 0) {
      return Math.round(((run.current_step ?? 0) / (run.workflow.length || 1)) * 100);
    }
    // fallback to completed steps fraction
    const completed = steps.filter((s) => s.status === 'completed').length;
    return steps.length > 0 ? Math.round((completed / steps.length) * 100) : run?.status === 'completed' ? 100 : 0;
  }, [run, steps]);

  useEffect(() => {
    // subscribe to DB changes for the run (status/current_step etc)
    const unsubRun = subscribeToRun(runId, (u) => {
      setRun(u);
      setLastEventAt(Date.now());
      setEventCount((c) => c + 1);
    });

    // subscribe to broadcasted run events (execution_step, run_failed, etc)
    const unsubEvents = subscribeToRunEvents(runId, (evt) => {
      setLastEventAt(Date.now());
      setEventCount((c) => c + 1);

      if (evt.event === 'execution_step') {
        const step = evt.payload as any;
        setSteps((prev) => {
          const exists = prev.find((s) => s.id === step.id);
          if (exists) return prev.map((s) => (s.id === step.id ? step : s));
          return [...prev, step];
        });
      } else if (evt.event === 'step_update') {
        const step = evt.payload as any;
        setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, ...step } : s)));
      } else if (evt.event === 'run_completed') {
        setRun((r: any) => ({ ...r, status: 'completed' }));
      } else if (evt.event === 'run_failed') {
        setRun((r: any) => ({ ...r, status: 'failed', error_message: evt.payload?.error ?? r.error_message }));
      }
    });

    const interval = setInterval(() => {
      const delta = Date.now() - lastEventAt;
      if (delta < 5000) setConnectionState('Connected');
      else if (delta < 15000) setConnectionState('Reconnecting');
      else setConnectionState('Disconnected');
    }, 2000);

    return () => {
      clearInterval(interval);
      try {
        unsubRun?.();
      } catch (e) {
        // ignore
      }
      try {
        unsubEvents?.();
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, lastEventAt]);

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm text-slate-400">Live connection</div>
            <div className="mt-1 text-sm font-semibold">
              {connectionState === 'Connected' && <span className="text-emerald-400">Connected</span>}
              {connectionState === 'Reconnecting' && <span className="text-yellow-300">Reconnecting</span>}
              {connectionState === 'Disconnected' && <span className="text-red-400">Disconnected</span>}
            </div>
          </div>

          <div>
            <div className="text-sm text-slate-400">Status</div>
            <div className="mt-1 font-semibold text-white">{(run?.status || 'unknown').toString()}</div>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-sm text-slate-400">Steps</div>
          <div className="text-xl font-semibold">{stepCount}</div>
          <div className="text-sm text-slate-400">Tool calls</div>
          <div className="text-xl font-semibold">{toolCallCount}</div>
          <div className="text-sm text-slate-400">Events</div>
          <div className="text-xl font-semibold">{traceEventCount}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm text-slate-400">Completion</div>
        <div className="mt-2 h-2 w-full rounded bg-slate-800">
          <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, completionPct)}%` }} />
        </div>
        <div className="mt-2 text-sm text-slate-300">{completionPct}%</div>
      </div>

      <div className="mt-6">
        <ExecutionTraceTimeline steps={steps} isRunning={run?.status === 'running'} />
      </div>
    </div>
  );
}
