import { describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_RELEASE_WORKFLOWS,
  collectReleaseEvidence,
  evaluateReleaseEvidence
} from '../../scripts/ci/release-evidence.mjs';

const sha = 'a'.repeat(40);

function successfulRuns(candidateSha = sha) {
  return REQUIRED_RELEASE_WORKFLOWS.map((name, index) => ({
    id: index + 1,
    name,
    head_sha: candidateSha,
    status: 'completed',
    conclusion: 'success',
    run_number: index + 1,
    html_url: `https://github.example/runs/${index + 1}`
  }));
}

const successfulVercel = [{
  id: 1,
  context: 'Vercel',
  state: 'success',
  target_url: 'https://vercel.example/deployment',
  updated_at: '2026-08-15T09:00:00.000Z'
}];

describe('release evidence evaluator', () => {
  it('passes only when every required workflow and Vercel succeeded for the candidate SHA', () => {
    const evidence = evaluateReleaseEvidence({
      candidateSha: sha,
      workflowRuns: successfulRuns(),
      commitStatuses: successfulVercel
    });

    expect(evidence.status).toBe('pass');
    expect(evidence.reasons).toEqual([]);
    expect(Object.keys(evidence.workflows)).toEqual([...REQUIRED_RELEASE_WORKFLOWS]);
    expect(evidence.commit_statuses.Vercel.state).toBe('success');
  });

  it('fails when a required workflow is missing for the candidate SHA', () => {
    const runs = successfulRuns().filter((run) => run.name !== 'Security Validation');

    const evidence = evaluateReleaseEvidence({
      candidateSha: sha,
      workflowRuns: runs,
      commitStatuses: successfulVercel
    });

    expect(evidence.status).toBe('fail');
    expect(evidence.reasons).toContain('workflow_missing:Security Validation');
    expect(evidence.workflows['Security Validation']).toMatchObject({ status: 'missing' });
  });

  it('fails when a required workflow did not complete successfully', () => {
    const runs = successfulRuns().map((run) =>
      run.name === 'E2E Test Suite'
        ? { ...run, conclusion: 'failure' }
        : run
    );

    const evidence = evaluateReleaseEvidence({
      candidateSha: sha,
      workflowRuns: runs,
      commitStatuses: successfulVercel
    });

    expect(evidence.status).toBe('fail');
    expect(evidence.reasons).toContain('workflow_not_success:E2E Test Suite:failure');
  });

  it('fails when the Vercel commit status is missing', () => {
    const evidence = evaluateReleaseEvidence({
      candidateSha: sha,
      workflowRuns: successfulRuns(),
      commitStatuses: []
    });

    expect(evidence.status).toBe('fail');
    expect(evidence.reasons).toContain('status_missing:Vercel');
    expect(evidence.commit_statuses.Vercel.state).toBe('missing');
  });

  it('uses the latest matching workflow run and Vercel status', () => {
    const runs = [
      ...successfulRuns(),
      {
        id: 100,
        name: 'Validate',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        run_number: 999,
        html_url: 'https://github.example/runs/100'
      },
      {
        id: 101,
        name: 'Validate',
        head_sha: 'b'.repeat(40),
        status: 'completed',
        conclusion: 'failure',
        run_number: 1000
      }
    ];
    const statuses = [
      {
        id: 1,
        context: 'Vercel',
        state: 'failure',
        updated_at: '2026-08-15T08:00:00.000Z'
      },
      {
        id: 2,
        context: 'Vercel',
        state: 'success',
        target_url: 'https://vercel.example/latest',
        updated_at: '2026-08-15T09:00:00.000Z'
      }
    ];

    const evidence = evaluateReleaseEvidence({
      candidateSha: sha,
      workflowRuns: runs,
      commitStatuses: statuses
    });

    expect(evidence.status).toBe('pass');
    expect(evidence.workflows.Validate.run_id).toBe(100);
    expect(evidence.commit_statuses.Vercel.target_url).toBe('https://vercel.example/latest');
  });

  it('collects Actions runs and commit statuses for the exact candidate SHA', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('/actions/runs?')) {
        return new Response(JSON.stringify({ workflow_runs: successfulRuns() }), { status: 200 });
      }
      if (value.endsWith(`/commits/${sha}/status`)) {
        return new Response(JSON.stringify({ statuses: successfulVercel }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const evidence = await collectReleaseEvidence({
      token: 'test-token',
      repository: 'Wilberry/agent-workbench',
      candidateSha: sha,
      fetchImpl: fetchMock
    });

    expect(evidence.status).toBe('pass');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`head_sha=${sha}`))).toBe(true);
  });
});
