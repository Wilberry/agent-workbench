'use client';

import { useEffect, useState, useRef } from 'react';
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

export default function ReplayPlayer({ runId }: { runId: string }) {
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/agent/run/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        setSteps(data.execution_trace || []);
        setIndex((data.execution_trace || []).length - 1);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [runId]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = window.setInterval(() => {
        setIndex((i) => Math.min((steps.length || 1) - 1, i + 1));
      }, 800);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, steps.length]);

  const visible = steps.slice(0, index + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsPlaying((p) => !p)}
          className="rounded bg-emerald-500 px-3 py-2 text-black"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded border px-3 py-2"
        >
          Step -
        </button>
        <button
          onClick={() => setIndex((i) => Math.min((steps.length || 1) - 1, i + 1))}
          className="rounded border px-3 py-2"
        >
          Step +
        </button>
        <div className="text-sm text-slate-400">{index + 1} / {steps.length}</div>
      </div>

      <ExecutionTraceTimeline steps={visible} isRunning={false} />
    </div>
  );
}
