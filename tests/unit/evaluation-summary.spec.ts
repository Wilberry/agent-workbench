import { describe, expect, it } from 'vitest';
import { buildEvaluationRunSummary } from '@agent-workbench/sdk/evaluations';
import type { EvaluationRunResult } from '@agent-workbench/sdk';

function result(id: string, exactMatch: boolean, tokens: number, latencyMs: number): EvaluationRunResult {
  return {
    id,
    evaluation_run_id: 'run-1',
    example_id: `example-${id}`,
    agent_output: { text: exactMatch ? 'match' : 'miss' },
    exact_match: exactMatch,
    details: {
      trace: {
        total_tokens: tokens,
        latency_ms: latencyMs,
        estimated_cost: 0.01,
        toolsCalled: ['search'],
        agentsUsed: ['Planner']
      }
    },
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z'
  };
}

describe('evaluation progress summary', () => {
  it('represents a newly queued evaluation with zero progress', () => {
    expect(buildEvaluationRunSummary([], 4)).toMatchObject({
      total_examples: 4,
      processed_examples: 0,
      remaining_examples: 4,
      exact_match_count: 0,
      exact_match_rate: 0,
      progress: 0
    });
  });

  it('aggregates partial progress from persisted result checkpoints', () => {
    const summary = buildEvaluationRunSummary([
      result('1', true, 100, 50),
      result('2', false, 200, 150)
    ], 4);

    expect(summary).toMatchObject({
      total_examples: 4,
      processed_examples: 2,
      remaining_examples: 2,
      exact_match_count: 1,
      exact_match_rate: 0.5,
      progress: 0.5,
      average_tokens: 150,
      average_latency_ms: 100,
      estimated_cost: 0.02,
      trace: {
        toolsCalled: ['search'],
        agentsUsed: ['Planner']
      }
    });
  });

  it('reports complete progress for an empty dataset', () => {
    expect(buildEvaluationRunSummary([], 0)).toMatchObject({
      total_examples: 0,
      processed_examples: 0,
      remaining_examples: 0,
      progress: 1
    });
  });
});
