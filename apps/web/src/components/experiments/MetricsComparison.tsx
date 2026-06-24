'use client';

import type { EvaluationRun } from '@agent-workbench/sdk';

interface Metric {
  label: string;
  unit: string;
  key: keyof typeof defaultValues;
  formatValue: (v: number) => string;
}

const defaultValues = {
  passRate: 0,
  latency: 0,
  tokens: 0,
  cost: 0,
  failures: 0
};

const metrics: Metric[] = [
  {
    label: 'Pass rate',
    unit: '%',
    key: 'passRate',
    formatValue: (v) => v.toFixed(1)
  },
  {
    label: 'Avg latency',
    unit: 'ms',
    key: 'latency',
    formatValue: (v) => v.toFixed(0)
  },
  {
    label: 'Avg tokens',
    unit: '',
    key: 'tokens',
    formatValue: (v) => v.toFixed(0)
  },
  {
    label: 'Est. cost',
    unit: '$',
    key: 'cost',
    formatValue: (v) => v.toFixed(4)
  },
  {
    label: 'Failures',
    unit: '',
    key: 'failures',
    formatValue: (v) => v.toFixed(0)
  }
];

interface MetricsComparisonProps {
  runA: EvaluationRun | null;
  runB: EvaluationRun | null;
  passRateA: number;
  passRateB: number;
  failuresB: number;
  failuresA: number;
}

export default function MetricsComparison({
  runA,
  runB,
  passRateA,
  passRateB,
  failuresA,
  failuresB
}: MetricsComparisonProps) {
  if (!runA || !runB) {
    return null;
  }

  const summaryA = (runA.summary as any) ?? {};
  const summaryB = (runB.summary as any) ?? {};

  const valuesA = {
    passRate: passRateA * 100,
    latency: Number(summaryA.average_latency_ms ?? 0),
    tokens: Number(summaryA.average_tokens ?? 0),
    cost: Number(summaryA.estimated_cost ?? 0),
    failures: failuresA
  };

  const valuesB = {
    passRate: passRateB * 100,
    latency: Number(summaryB.average_latency_ms ?? 0),
    tokens: Number(summaryB.average_tokens ?? 0),
    cost: Number(summaryB.estimated_cost ?? 0),
    failures: failuresB
  };

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-4">
      <h2 className="text-xl font-semibold mb-6">All metrics</h2>

      <div className="space-y-3">
        {metrics.map((metric) => {
          const valueA = valuesA[metric.key];
          const valueB = valuesB[metric.key];
          const delta = valueB - valueA;
          const deltaPct = valueA !== 0 ? (delta / valueA) * 100 : 0;

          // Determine winner (higher is better for pass rate, lower is better for others)
          let winner: 'a' | 'b' | 'tie' = 'tie';
          if (metric.key === 'passRate') {
            if (valueB > valueA) winner = 'b';
            else if (valueA > valueB) winner = 'a';
          } else {
            if (valueB < valueA) winner = 'b';
            else if (valueA < valueB) winner = 'a';
          }

          const deltaColor =
            metric.key === 'passRate' || metric.key === 'failures'
              ? delta >= 0
                ? 'text-emerald-400'
                : 'text-red-400'
              : delta <= 0
                ? 'text-emerald-400'
                : 'text-red-400';

          return (
            <div
              key={metric.key}
              className="grid grid-cols-4 gap-3 items-center rounded-2xl bg-slate-950 p-4"
            >
              <div className="text-sm text-slate-400 font-medium">{metric.label}</div>

              <div className={`text-center px-3 py-2 rounded border ${winner === 'a' ? 'border-emerald-600 bg-emerald-950/30' : 'border-slate-700'}`}>
                <div className="text-xs text-slate-500 mb-1">Version A</div>
                <div className={`text-lg font-semibold ${winner === 'a' ? 'text-emerald-300' : 'text-white'}`}>
                  {metric.formatValue(valueA)}
                </div>
                <div className="text-xs text-slate-600">{metric.unit}</div>
              </div>

              <div className={`text-center px-3 py-2 rounded border ${winner === 'b' ? 'border-emerald-600 bg-emerald-950/30' : 'border-slate-700'}`}>
                <div className="text-xs text-slate-500 mb-1">Version B</div>
                <div className={`text-lg font-semibold ${winner === 'b' ? 'text-emerald-300' : 'text-white'}`}>
                  {metric.formatValue(valueB)}
                </div>
                <div className="text-xs text-slate-600">{metric.unit}</div>
              </div>

              <div className="text-center">
                <div className={`text-lg font-semibold ${deltaColor}`}>
                  {delta >= 0 ? '+' : ''}
                  {metric.key === 'passRate' || metric.key === 'failures'
                    ? metric.formatValue(delta)
                    : metric.formatValue(delta)}
                </div>
                <div className={`text-xs ${deltaColor}`}>
                  {deltaPct >= 0 ? '+' : ''}
                  {deltaPct.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
