import { describe, expect, it } from 'vitest';
import { agentRuns } from '@agent-workbench/sdk';

describe('agentRuns.orgTelemetry', () => {
  it('computes aggregated telemetry from run rows', async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                { estimated_cost: 0.12, latency_ms: 200, total_tokens: 120 },
                { estimated_cost: 0.08, latency_ms: 100, total_tokens: 80 }
              ],
              error: null
            })
        })
      })
    } as any;

    const telemetry = await agentRuns.orgTelemetry('org-id', mockClient);

    expect(telemetry).toEqual({
      total_runs: 2,
      total_tokens: 200,
      total_estimated_cost: 0.2,
      average_latency_ms: 150
    });
  });
});
