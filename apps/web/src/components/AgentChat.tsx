'use client';

import { useEffect, useMemo, useState } from 'react';
import { subscribeToRunEvents } from '@agent-workbench/sdk';
import ExecutionTraceTimeline from './ExecutionTraceTimeline';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ExecutionTrace = {
  memoryUsed: boolean;
  toolsCalled: string[];
  modelIterations: number;
  agentsUsed: string[];
};

type ExecutionStep = {
  id: string;
  run_id: string;
  step: 'planner' | 'executor' | 'reviewer' | 'tool' | 'memory' | 'error';
  status: 'started' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
  timestamp: string;
  metadata?: { model?: string; tokens?: number; toolName?: string } | null;
};

type Props = {
  agentId: string;
  conversationId: string;
  userId: string;
};

export default function AgentChat({ agentId, conversationId, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    async function loadMessages() {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages);
    }

    if (conversationId) {
      loadMessages();
    }
  }, [conversationId]);

  const typedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        roleLabel: message.role === 'user' ? 'You' : 'Agent'
      })),
    [messages]
  );

  const handleSend = async () => {
    if (!userInput.trim()) return;
    setIsSending(true);
    setError(null);
    setTrace(null);
    setExecutionSteps([]);
    setIsRunning(true);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput
    };

    setMessages((prev) => [...prev, userMessage]);
    setUserInput('');

    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: ''
    };

    setMessages((prev) => [...prev, assistantMessage]);

    let unsubscribe: (() => void) | null = null;

    try {
      // Enqueue the workflow
      const enqueueResponse = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          message: userMessage.content,
          workflow: ['Planner', 'Executor', 'Reviewer']
        })
      });

      if (!enqueueResponse.ok) {
        const body = await enqueueResponse.text();
        throw new Error(body || 'Failed to enqueue workflow');
      }

      const enqueueData = await enqueueResponse.json();
      const runId = enqueueData.runId as string;

      // Subscribe to realtime step events
      unsubscribe = subscribeToRunEvents(runId, async (evt) => {
        try {
          if (evt.event === 'execution_step') {
            const step = evt.payload as ExecutionStep;

            setExecutionSteps((prev) => {
              const exists = prev.find((s) => s.id === step.id);
              if (exists) {
                return prev.map((s) => (s.id === step.id ? step : s));
              }
              return [...prev, step];
            });

            if (step.output) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessage.id ? { ...message, content: step.output } : message
                )
              );
            }
          } else if (evt.event === 'run_completed') {
            setIsRunning(false);
            // Fetch final run to build summary trace
            const res = await fetch(`/api/agent/run/${runId}`);
            if (res.ok) {
              const run = await res.json();
              const traceSteps = (run.execution_trace || []) as ExecutionStep[];
              setExecutionSteps(traceSteps);

              const allToolsCalled = traceSteps.flatMap((s: any) => s.metadata?.toolName ? [s.metadata.toolName] : []);
              const totalIterations = traceSteps.reduce((sum: number, s: any) => sum + (s.metadata?.tokens ?? 0), 0);

              const finalTrace: ExecutionTrace = {
                memoryUsed: traceSteps.some((s: any) => !!s.metadata?.memoryUsed),
                toolsCalled: allToolsCalled,
                modelIterations: totalIterations,
                agentsUsed: run.workflow
              };

              setTrace(finalTrace);
            }
          } else if (evt.event === 'run_failed') {
            setIsRunning(false);
            const payload = evt.payload as any;
            setError(payload?.error || 'Workflow failed');
            // fetch full run for details
            const res = await fetch(`/api/agent/run/${runId}`);
            if (res.ok) {
              const run = await res.json();
              setExecutionSteps(run.execution_trace || []);
            }
          }
        } catch (err) {
          // ignore errors from handler
        }
      });
    } catch (err) {
      setError((err as Error).message);
      setMessages((prev) => prev.filter((message) => message.id !== assistantMessage.id));
      setIsRunning(false);
    } finally {
      setIsSending(false);
      // Unsubscribe when component unmounts or after completion
      if (unsubscribe) {
        setTimeout(() => unsubscribe?.(), 5000); // Give UI time to update
      }
    }
  };

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      // Cleanup handled in handleSend finally block
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
        {typedMessages.length === 0 ? (
          <div className="text-slate-400">Send your first message to begin the conversation.</div>
        ) : (
          typedMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-3xl p-4 ${
                message.role === 'user' ? 'bg-slate-950 text-right' : 'bg-slate-800 text-left'
              }`}
            >
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{message.roleLabel}</div>
              <div className="whitespace-pre-wrap text-slate-100">{message.content}</div>
            </div>
          ))
        )}
      </div>

      {error ? <div className="text-red-400">{error}</div> : null}

      {executionSteps.length > 0 && (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-300">Execution Timeline</div>
          <ExecutionTraceTimeline steps={executionSteps} isRunning={isRunning} />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          rows={3}
          className="min-h-[120px] w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
          placeholder="Type your message..."
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending}
          className="rounded-3xl bg-emerald-500 px-6 py-4 font-semibold text-slate-950 disabled:opacity-60"
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {trace ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-300">Execution Trace</div>
          <div className="text-sm text-slate-400">
            <div>Memory used: {trace.memoryUsed ? 'Yes' : 'No'}</div>
            <div>Agents: {trace.agentsUsed.join(', ')}</div>
            <div>Tools called: {trace.toolsCalled.length > 0 ? trace.toolsCalled.join(', ') : 'None'}</div>
            <div>Model iterations: {trace.modelIterations}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
