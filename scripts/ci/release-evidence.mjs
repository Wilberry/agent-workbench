#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const REQUIRED_RELEASE_WORKFLOWS = Object.freeze([
  'Validate',
  'Security Validation',
  'Integration Test Suite',
  'Reliability Validation',
  'E2E Test Suite'
]);

function compareRecency(left, right) {
  const leftNumber = Number(left?.run_number ?? left?.id ?? 0);
  const rightNumber = Number(right?.run_number ?? right?.id ?? 0);
  return rightNumber - leftNumber;
}

function latestWorkflowRun(workflowRuns, workflowName, candidateSha) {
  return workflowRuns
    .filter((run) => run?.name === workflowName && run?.head_sha === candidateSha)
    .sort(compareRecency)[0] ?? null;
}

function latestStatus(statuses, context) {
  return statuses
    .filter((status) => status?.context === context)
    .sort((left, right) => {
      const leftTime = Date.parse(left?.updated_at ?? left?.created_at ?? '') || 0;
      const rightTime = Date.parse(right?.updated_at ?? right?.created_at ?? '') || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return Number(right?.id ?? 0) - Number(left?.id ?? 0);
    })[0] ?? null;
}

export function evaluateReleaseEvidence({
  candidateSha,
  workflowRuns = [],
  commitStatuses = [],
  requiredWorkflows = REQUIRED_RELEASE_WORKFLOWS
}) {
  const reasons = [];
  const workflows = {};

  for (const workflowName of requiredWorkflows) {
    const run = latestWorkflowRun(workflowRuns, workflowName, candidateSha);
    if (!run) {
      workflows[workflowName] = { status: 'missing', conclusion: null, run_id: null, url: null };
      reasons.push(`workflow_missing:${workflowName}`);
      continue;
    }

    workflows[workflowName] = {
      status: run.status ?? null,
      conclusion: run.conclusion ?? null,
      run_id: run.id ?? null,
      url: run.html_url ?? null
    };

    if (run.status !== 'completed' || run.conclusion !== 'success') {
      reasons.push(
        `workflow_not_success:${workflowName}:${run.conclusion ?? run.status ?? 'unknown'}`
      );
    }
  }

  const vercel = latestStatus(commitStatuses, 'Vercel');
  const vercelEvidence = vercel
    ? {
        state: vercel.state ?? null,
        target_url: vercel.target_url ?? null
      }
    : { state: 'missing', target_url: null };

  if (!vercel) {
    reasons.push('status_missing:Vercel');
  } else if (vercel.state !== 'success') {
    reasons.push(`status_not_success:Vercel:${vercel.state ?? 'unknown'}`);
  }

  return {
    schema_version: 1,
    candidate_sha: candidateSha,
    status: reasons.length === 0 ? 'pass' : 'fail',
    required_workflows: [...requiredWorkflows],
    workflows,
    commit_statuses: { Vercel: vercelEvidence },
    reasons
  };
}

async function githubJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}`);
  }

  return response.json();
}

export async function collectReleaseEvidence({
  token,
  repository,
  candidateSha,
  fetchImpl = globalThis.fetch
}) {
  if (!fetchImpl) throw new Error('A fetch implementation is required');
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!repository || !repository.includes('/')) throw new Error('GITHUB_REPOSITORY is required');
  if (!/^[0-9a-f]{40}$/i.test(candidateSha ?? '')) {
    throw new Error('Release candidate SHA must be a full 40-character Git commit SHA');
  }

  const base = `https://api.github.com/repos/${repository}`;
  const [runsPayload, statusPayload] = await Promise.all([
    githubJson(
      fetchImpl,
      `${base}/actions/runs?head_sha=${encodeURIComponent(candidateSha)}&per_page=100`,
      token
    ),
    githubJson(fetchImpl, `${base}/commits/${encodeURIComponent(candidateSha)}/status`, token)
  ]);

  return evaluateReleaseEvidence({
    candidateSha,
    workflowRuns: Array.isArray(runsPayload?.workflow_runs) ? runsPayload.workflow_runs : [],
    commitStatuses: Array.isArray(statusPayload?.statuses) ? statusPayload.statuses : []
  });
}

async function main() {
  const candidateSha = process.argv[2] ?? process.env.RELEASE_CANDIDATE_SHA ?? process.env.GITHUB_SHA;
  const outputPath = process.env.RELEASE_EVIDENCE_OUTPUT ?? 'release-evidence.json';

  try {
    const evidence = await collectReleaseEvidence({
      token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
      candidateSha
    });

    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    if (evidence.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const evidence = {
      schema_version: 1,
      candidate_sha: candidateSha ?? null,
      status: 'error',
      reasons: [`collector_error:${message}`]
    };
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8').catch(() => {});
    process.stderr.write(`Release evidence collection failed: ${message}\n`);
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
