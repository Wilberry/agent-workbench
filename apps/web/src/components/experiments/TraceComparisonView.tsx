'use client';

import type { EvaluationRunResult } from '@agent-workbench/sdk';

interface TraceStep {
  name: string;
  latency?: number;
  input?: unknown;
  output?: unknown;
}

interface TraceComparison {
  trace: {
    steps?: TraceStep[];
    toolsCalled?: string[];
    agentsUsed?: string[];
  };
}

interface TraceComparisonViewProps {
  resultsA: EvaluationRunResult[];
  resultsB: EvaluationRunResult[];
}

interface StepComparisonRow {
  index: number;
  stepA?: TraceStep;
  stepB?: TraceStep;
  status: 'common' | 'onlyA' | 'onlyB' | 'changed';
  latencyDelta?: number;
  stepNameChanged: boolean;
  toolInvocationChanged: boolean;
}

function extractTrace(result: EvaluationRunResult): TraceComparison['trace'] {
  const details = (result.details as any) ?? {};
  const trace = details.trace ?? {};
  return trace;
}

function getTraceToolsFromResults(results: EvaluationRunResult[]): Set<string> {
  const tools = new Set<string>();
  results.forEach((result) => {
    const trace = extractTrace(result);
    if (Array.isArray(trace.toolsCalled)) {
      trace.toolsCalled.forEach((tool) => {
        if (typeof tool === 'string') tools.add(tool);
      });
    }
  });
  return tools;
}

function getTraceAgentsFromResults(results: EvaluationRunResult[]): Set<string> {
  const agents = new Set<string>();
  results.forEach((result) => {
    const trace = extractTrace(result);
    if (Array.isArray(trace.agentsUsed)) {
      trace.agentsUsed.forEach((agent) => {
        if (typeof agent === 'string') agents.add(agent);
      });
    }
  });
  return agents;
}

function getTraceStepsFromResults(results: EvaluationRunResult[]): TraceStep[] {
  return results.flatMap((result) => {
    const trace = extractTrace(result);
    if (!Array.isArray(trace.steps)) return [];
    return trace.steps.filter((step): step is TraceStep => typeof step?.name === 'string');
  });
}

function getTraceSummary(results: EvaluationRunResult[]) {
  const steps = getTraceStepsFromResults(results);
  const trace = results.reduce<Record<string, unknown>>((acc, result) => {
    const resultTrace = extractTrace(result);
    if (Array.isArray(resultTrace.toolsCalled)) {
      const existing = (acc.toolsCalled as string[]) ?? [];
      acc.toolsCalled = Array.from(new Set([...existing, ...resultTrace.toolsCalled.filter((tool) => typeof tool === 'string')]));
    }
    return acc;
  }, {} as Record<string, unknown>);

  const totalLatency = steps.reduce((sum, step) => sum + (typeof step.latency === 'number' ? step.latency : 0), 0);
  const toolCount = Array.isArray(trace.toolsCalled) ? trace.toolsCalled.length : 0;

  return {
    stepCount: steps.length,
    toolCount,
    totalLatency,
    steps
  };
}

function getStepComparisonRows(stepsA: TraceStep[], stepsB: TraceStep[]): StepComparisonRow[] {
  const rows: StepComparisonRow[] = [];
  const maxLength = Math.max(stepsA.length, stepsB.length);

  for (let index = 0; index < maxLength; index += 1) {
    const stepA = stepsA[index];
    const stepB = stepsB[index];
    let status: StepComparisonRow['status'] = 'common';
    let stepNameChanged = false;
    let toolInvocationChanged = false;
    let latencyDelta: number | undefined;

    if (stepA && stepB) {
      stepNameChanged = stepA.name !== stepB.name;
      if (stepNameChanged) {
        status = 'changed';
      }
      if (typeof stepA.latency === 'number' && typeof stepB.latency === 'number') {
        latencyDelta = stepB.latency - stepA.latency;
      }
      toolInvocationChanged = stepNameChanged && /tool|invoke|call|execution/i.test(stepA.name + stepB.name);
    } else if (stepA) {
      status = 'onlyA';
    } else if (stepB) {
      status = 'onlyB';
    }

    rows.push({
      index: index + 1,
      stepA,
      stepB,
      status,
      latencyDelta,
      stepNameChanged,
      toolInvocationChanged
    });
  }

  return rows;
}

export default function TraceComparisonView({ resultsA, resultsB }: TraceComparisonViewProps) {
  const toolsA = getTraceToolsFromResults(resultsA);
  const toolsB = getTraceToolsFromResults(resultsB);
  const agentsA = getTraceAgentsFromResults(resultsA);
  const agentsB = getTraceAgentsFromResults(resultsB);

  const summaryA = getTraceSummary(resultsA);
  const summaryB = getTraceSummary(resultsB);
  const stepRows = getStepComparisonRows(summaryA.steps, summaryB.steps);

  const allTools = new Set([...toolsA, ...toolsB]);
  const allAgents = new Set([...agentsA, ...agentsB]);

  const toolsOnlyInA = Array.from(toolsA).filter((t) => !toolsB.has(t));
  const toolsOnlyInB = Array.from(toolsB).filter((t) => !toolsA.has(t));
  const commonTools = Array.from(toolsA).filter((t) => toolsB.has(t));

  const agentsOnlyInA = Array.from(agentsA).filter((a) => !agentsB.has(a));
  const agentsOnlyInB = Array.from(agentsB).filter((a) => !agentsA.has(a));
  const commonAgents = Array.from(agentsA).filter((a) => agentsB.has(a));

  const totalLatencyDelta = summaryA.totalLatency && summaryB.totalLatency ? summaryB.totalLatency - summaryA.totalLatency : undefined;
  const winner = summaryA.totalLatency && summaryB.totalLatency
    ? summaryA.totalLatency < summaryB.totalLatency
      ? 'A'
      : summaryB.totalLatency < summaryA.totalLatency
        ? 'B'
        : 'Tie'
    : summaryA.stepCount !== summaryB.stepCount
      ? summaryA.stepCount < summaryB.stepCount
        ? 'A'
        : 'B'
      : 'Tie';

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-6">
      <h2 className="text-xl font-semibold mb-6">Trace comparison</h2>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-slate-950 p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Version A trace summary</div>
          <div className="mt-3 space-y-3 text-sm text-white">
            <div>Step count: {summaryA.stepCount}</div>
            <div>Tool count: {summaryA.toolCount}</div>
            <div>Total latency: {summaryA.totalLatency.toFixed(0)} ms</div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950 p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Version B trace summary</div>
          <div className="mt-3 space-y-3 text-sm text-white">
            <div>Step count: {summaryB.stepCount}</div>
            <div>Tool count: {summaryB.toolCount}</div>
            <div>Total latency: {summaryB.totalLatency.toFixed(0)} ms</div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950 p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Trace winner</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {winner === 'Tie' ? 'Tie' : `Version ${winner}`}
          </div>
          <div className="mt-3 text-sm text-slate-400">
            {totalLatencyDelta !== undefined
              ? `Latency delta: ${totalLatencyDelta >= 0 ? '+' : ''}${totalLatencyDelta.toFixed(0)} ms`
              : 'Latency unavailable'}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-950 p-4 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Tools used</h3>
          <div className="space-y-3">
            {commonTools.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Common</div>
                <div className="flex flex-wrap gap-2">
                  {commonTools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-block px-2 py-1 rounded text-xs bg-slate-800 text-slate-300"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {toolsOnlyInA.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Version A only</div>
                <div className="flex flex-wrap gap-2">
                  {toolsOnlyInA.map((tool) => (
                    <span
                      key={tool}
                      className="inline-block px-2 py-1 rounded text-xs bg-emerald-950 text-emerald-300"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {toolsOnlyInB.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Version B only</div>
                <div className="flex flex-wrap gap-2">
                  {toolsOnlyInB.map((tool) => (
                    <span
                      key={tool}
                      className="inline-block px-2 py-1 rounded text-xs bg-red-950 text-red-300"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {allTools.size === 0 && (
              <div className="text-xs text-slate-500">No tools called in either version</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950 p-4 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Agents used</h3>
          <div className="space-y-3">
            {commonAgents.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Common</div>
                <div className="flex flex-wrap gap-2">
                  {commonAgents.map((agent) => (
                    <span
                      key={agent}
                      className="inline-block px-2 py-1 rounded text-xs bg-slate-800 text-slate-300"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {agentsOnlyInA.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Version A only</div>
                <div className="flex flex-wrap gap-2">
                  {agentsOnlyInA.map((agent) => (
                    <span
                      key={agent}
                      className="inline-block px-2 py-1 rounded text-xs bg-emerald-950 text-emerald-300"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {agentsOnlyInB.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Version B only</div>
                <div className="flex flex-wrap gap-2">
                  {agentsOnlyInB.map((agent) => (
                    <span
                      key={agent}
                      className="inline-block px-2 py-1 rounded text-xs bg-red-950 text-red-300"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {allAgents.size === 0 && (
              <div className="text-xs text-slate-500">No agents used in either version</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-950 p-4 border border-slate-700">
        <div className="text-sm font-semibold text-slate-200 mb-4">Step-by-step comparison</div>
        {stepRows.length === 0 ? (
          <div className="text-sm text-slate-400">No trace steps available for comparison.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Version A step</th>
                  <th className="px-3 py-2">Version B step</th>
                  <th className="px-3 py-2">Latency delta</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {stepRows.map((row) => (
                  <tr
                    key={row.index}
                    className={`border-b border-slate-700 ${
                      row.status === 'onlyA'
                        ? 'bg-emerald-950/10'
                        : row.status === 'onlyB'
                          ? 'bg-red-950/10'
                          : row.status === 'changed'
                            ? 'bg-amber-950/10'
                            : ''
                    }`}
                  >
                    <td className="px-3 py-3 align-top text-slate-300">{row.index}</td>
                    <td className="px-3 py-3">
                      {row.stepA ? (
                        <div className="space-y-1">
                          <div className="font-semibold text-white">{row.stepA.name}</div>
                          <div className="text-xs text-slate-400">{typeof row.stepA.latency === 'number' ? `${row.stepA.latency.toFixed(0)} ms` : 'No latency'}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">Missing</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.stepB ? (
                        <div className="space-y-1">
                          <div className="font-semibold text-white">{row.stepB.name}</div>
                          <div className="text-xs text-slate-400">{typeof row.stepB.latency === 'number' ? `${row.stepB.latency.toFixed(0)} ms` : 'No latency'}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">Missing</div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-slate-300">
                      {typeof row.latencyDelta === 'number' ? (
                        <span className={row.latencyDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                          {row.latencyDelta >= 0 ? '+' : ''}{row.latencyDelta.toFixed(0)} ms
                        </span>
                      ) : (
                        <span className="text-slate-500">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="space-y-1">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                            row.status === 'common'
                              ? 'bg-slate-800 text-slate-300'
                              : row.status === 'onlyA'
                                ? 'bg-emerald-950 text-emerald-200'
                                : row.status === 'onlyB'
                                  ? 'bg-red-950 text-red-200'
                                  : 'bg-amber-950 text-amber-200'
                          }`}
                        >
                          {row.status === 'common'
                            ? 'Common'
                            : row.status === 'onlyA'
                              ? 'A only'
                              : row.status === 'onlyB'
                                ? 'B only'
                                : 'Changed'}
                        </span>
                        {row.toolInvocationChanged && (
                          <span className="block text-xs text-slate-400">Tool invocation changed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 pt-4 border-t border-slate-700 space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded bg-slate-800"></span>
          <span>Common step</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded bg-emerald-950"></span>
          <span>Step only in Version A</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded bg-red-950"></span>
          <span>Step only in Version B</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded bg-amber-950"></span>
          <span>Changed step name or tool invocation</span>
        </div>
      </div>
    </div>
  );
}
