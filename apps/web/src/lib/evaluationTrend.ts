/**
 * Calculate trend direction for evaluation metrics.
 * 
 * Data assumption: Runs are ordered by creation time (newest first).
 * The "first" segment represents newer runs, and the "second" segment represents older runs.
 * Trend is positive (up) when performance improves over time.
 */

export type TrendDirection = 'up' | 'down' | 'stable';

/**
 * Safely convert a rate value to a number.
 * Handles number, string, and undefined values.
 */
function getPassRate(rate: any): number {
  if (typeof rate === 'number') return rate;
  if (typeof rate === 'string') return parseFloat(rate) || 0;
  return 0;
}

/**
 * Calculate trend direction based on comparing newer runs against older runs.
 * 
 * @param newerAvg - Average pass rate for newer runs (first half of time-ordered data)
 * @param olderAvg - Average pass rate for older runs (second half of time-ordered data)
 * @param threshold - Percentage threshold for trend detection (default 0.05 = 5%)
 * @returns 'up' if performance improved, 'down' if degraded, 'stable' if within threshold
 * 
 * Example: newerAvg=0.75, olderAvg=0.70, threshold=0.05
 * - threshold check: 0.75 > 0.70 * 1.05? (0.735)? YES
 * - Result: 'up' (performance improving)
 */
export function calculateTrend(
  newerAvg: number,
  olderAvg: number,
  threshold: number = 0.05
): TrendDirection {
  if (olderAvg === 0) return 'stable'; // No baseline to compare against

  const upperBound = olderAvg * (1 + threshold);
  const lowerBound = olderAvg * (1 - threshold);

  if (newerAvg > upperBound) return 'up';
  if (newerAvg < lowerBound) return 'down';
  return 'stable';
}

/**
 * Calculate trend for a list of runs grouped by time order.
 * Assumes runs are pre-sorted with newest first.
 */
export function calculateRunsTrend(
  runs: Array<{ summary?: { exact_match_rate?: number | string | null } }>,
  threshold: number = 0.05
): { trend: TrendDirection; dataPoints: number } {
  if (runs.length === 0) return { trend: 'stable', dataPoints: 0 };

  const completed = runs.filter((r: any) => r.status === 'completed');
  if (completed.length < 2) return { trend: 'stable', dataPoints: completed.length };

  // Split: first half (newer), second half (older)
  const half = Math.ceil(completed.length / 2);
  const newerRuns = completed.slice(0, half);
  const olderRuns = completed.slice(half);

  const newerAvg =
    newerRuns.reduce((sum, r: any) => {
      const rate = r.summary?.exact_match_rate ?? 0;
      return sum + getPassRate(rate);
    }, 0) / newerRuns.length || 0;

  const olderAvg =
    olderRuns.reduce((sum, r: any) => {
      const rate = r.summary?.exact_match_rate ?? 0;
      return sum + getPassRate(rate);
    }, 0) / olderRuns.length || 0;

  const trend = calculateTrend(newerAvg, olderAvg, threshold);

  return {
    trend,
    dataPoints: completed.length
  };
}
