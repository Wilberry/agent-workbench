'use client';

import { useMemo } from 'react';
import type { EvaluationRun } from '@agent-workbench/sdk';
import { calculateRunsTrend } from '@/lib/evaluationTrend';

interface EvaluationAnalyticsProps {
  runs: EvaluationRun[];
}

interface VersionMetrics {
  versionId: string;
  totalRuns: number;
  completedRuns: number;
  passRate: number;
  avgPassRate: number;
  trend: 'up' | 'down' | 'stable';
  dataPoints: number; // Number of data points used for trend calculation
}

interface TimeSeriesPoint {
  date: string;
  passRate: number;
  runCount: number;
}

export default function EvaluationAnalytics({ runs }: EvaluationAnalyticsProps) {
  const metrics = useMemo(() => {
    // Group by version
    const versionMap = new Map<string, EvaluationRun[]>();
    runs.forEach((run) => {
      if (!versionMap.has(run.agent_version_id)) {
        versionMap.set(run.agent_version_id, []);
      }
      versionMap.get(run.agent_version_id)?.push(run);
    });

    // Helper to safely extract pass rate
    const getPassRate = (rate: any): number => {
      if (typeof rate === 'number') return rate;
      if (typeof rate === 'string') return parseFloat(rate) || 0;
      return 0;
    };

    // Calculate metrics per version
    const versionMetrics: VersionMetrics[] = Array.from(versionMap.entries()).map(
      ([versionId, versionRuns]) => {
        const completed = versionRuns.filter((r) => r.status === 'completed');
        const totalPassRate = completed.reduce((sum, r) => {
          const rate = r.summary?.exact_match_rate ?? 0;
          return sum + getPassRate(rate);
        }, 0);
        const avgPassRate = completed.length > 0 ? totalPassRate / completed.length : 0;

        // Calculate trend direction using helper function
        // Note: versionRuns are ordered newest-first, so trend calculation
        // compares newer runs (first half) against older runs (second half)
        const { trend, dataPoints } = calculateRunsTrend(completed);

        return {
          versionId,
          totalRuns: versionRuns.length,
          completedRuns: completed.length,
          passRate: completed.length > 0 ? avgPassRate : 0,
          avgPassRate,
          trend,
          dataPoints
        };
      }
    );

    return versionMetrics.sort((a, b) => b.passRate - a.passRate);
  }, [runs]);

  const timeSeries = useMemo(() => {
    // Group runs by date and calculate daily pass rates
    const getPassRate = (rate: any): number => {
      if (typeof rate === 'number') return rate;
      if (typeof rate === 'string') return parseFloat(rate) || 0;
      return 0;
    };

    const dateMap = new Map<string, EvaluationRun[]>();
    runs.forEach((run) => {
      const date = new Date(run.created_at).toLocaleDateString();
      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)?.push(run);
    });

    const series: TimeSeriesPoint[] = Array.from(dateMap.entries())
      .map(([date, dateRuns]) => {
        const completed = dateRuns.filter((r) => r.status === 'completed');
        const passRate = completed.reduce((sum, r) => {
          const rate = r.summary?.exact_match_rate ?? 0;
          return sum + getPassRate(rate);
        }, 0) / (completed.length || 1);

        return {
          date,
          passRate,
          runCount: dateRuns.length
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return series;
  }, [runs]);

  const overallPassRate = useMemo(() => {
    const getPassRate = (rate: any): number => {
      if (typeof rate === 'number') return rate;
      if (typeof rate === 'string') return parseFloat(rate) || 0;
      return 0;
    };

    const completed = runs.filter((r) => r.status === 'completed');
    if (completed.length === 0) return 0;
    const total = completed.reduce((sum, r) => {
      const rate = r.summary?.exact_match_rate ?? 0;
      return sum + getPassRate(rate);
    }, 0);
    return total / completed.length;
  }, [runs]);

  return (
    <div className="space-y-6">
      {/* Overall metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Overall Pass Rate</div>
          <div className="mt-2 text-3xl font-bold text-emerald-400">
            {(overallPassRate * 100).toFixed(1)}%
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {runs.filter((r) => r.status === 'completed').length} / {runs.length} runs completed
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Total Evaluations</div>
          <div className="mt-2 text-3xl font-bold text-white">{runs.length}</div>
          <div className="mt-2 text-xs text-slate-500">Across all versions</div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Version Count</div>
          <div className="mt-2 text-3xl font-bold text-blue-400">
            {new Set(runs.map((r) => r.agent_version_id)).size}
          </div>
          <div className="mt-2 text-xs text-slate-500">Unique versions tested</div>
        </div>
      </div>

      {/* Pass-rate trend over time */}
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">Pass-Rate Trend</h3>
        {timeSeries.length === 0 ? (
          <div className="text-center text-slate-400">No evaluation data yet.</div>
        ) : (
          <div className="space-y-3">
            {timeSeries.map((point, idx) => {
              const barWidth = `${Math.round(point.passRate * 100)}%`;
              return (
                <div key={idx}>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>{point.date}</span>
                    <span>{(point.passRate * 100).toFixed(1)}% ({point.runCount} runs)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Version comparison */}
      {metrics.length > 0 && (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">Version Performance</h3>
          <div className="space-y-3">
            {metrics.map((metric) => (
              <div key={metric.versionId} className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-200">
                    Version {metric.versionId.slice(0, 8)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-400">
                      {(metric.passRate * 100).toFixed(1)}%
                    </span>
                    {metric.dataPoints >= 4 ? (
                      <>
                        {metric.trend === 'up' && (
                          <span className="text-xs text-emerald-400">↑ Improving</span>
                        )}
                        {metric.trend === 'down' && (
                          <span className="text-xs text-red-400">↓ Declining</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">— Insufficient data</span>
                    )}
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${metric.passRate * 100}%` }}
                  />
                </div>

                <div className="mt-2 flex gap-4 text-xs text-slate-400">
                  <span>{metric.completedRuns} / {metric.totalRuns} completed</span>
                  <span>Avg: {(metric.avgPassRate * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
