import { describe, expect, it, vi } from 'vitest';
import { AgentWorkbenchApiError } from '@agent-workbench/sdk/public';
import { runCli } from '../../packages/cli/src/cli.mjs';

const agent = {
  id: 'agent-1',
  organization_id: 'org-1',
  name: 'Support Agent',
  description: null,
  system_prompt: 'Be helpful.',
  model: 'gpt-4o-mini',
  provider: 'openai',
  created_at: '2026-08-11T00:00:00.000Z'
};

function captureStream() {
  let value = '';
  return {
    stream: {
      write(chunk: string | Uint8Array) {
        value += String(chunk);
        return true;
      }
    },
    read: () => value
  };
}

function createHarness(createClient = vi.fn(() => ({
  agents: { list: vi.fn(async () => [agent]) }
}))) {
  const stdout = captureStream();
  const stderr = captureStream();
  return { createClient, stdout, stderr };
}

describe('Agent Workbench CLI', () => {
  it('prints help without constructing a client', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['--help'], {
      env: {},
      stdout: harness.stdout.stream,
      stderr: harness.stderr.stream,
      createClient: harness.createClient
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.read()).toContain('awb agents list');
    expect(harness.createClient).not.toHaveBeenCalled();
  });

  it('lists agents in a human-readable table using environment configuration', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['agents', 'list'], {
      env: {
        AGENT_WORKBENCH_API_KEY: 'awb_live_secret',
        AGENT_WORKBENCH_BASE_URL: 'https://workbench.example.com'
      },
      stdout: harness.stdout.stream,
      stderr: harness.stderr.stream,
      createClient: harness.createClient
    });

    expect(exitCode).toBe(0);
    expect(harness.createClient).toHaveBeenCalledWith({
      baseUrl: 'https://workbench.example.com',
      apiKey: 'awb_live_secret'
    });
    expect(harness.stdout.read()).toContain('Support Agent');
    expect(harness.stdout.read()).toContain('gpt-4o-mini');
    expect(harness.stdout.read()).not.toContain('awb_live_secret');
  });

  it('supports JSON output and lets --base-url override the environment URL', async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      ['agents', 'list', '--json', '--base-url', 'https://override.example.com'],
      {
        env: {
          AGENT_WORKBENCH_API_KEY: 'awb_live_secret',
          AGENT_WORKBENCH_BASE_URL: 'https://ignored.example.com'
        },
        stdout: harness.stdout.stream,
        stderr: harness.stderr.stream,
        createClient: harness.createClient
      }
    );

    expect(exitCode).toBe(0);
    expect(harness.createClient).toHaveBeenCalledWith({
      baseUrl: 'https://override.example.com',
      apiKey: 'awb_live_secret'
    });
    expect(JSON.parse(harness.stdout.read())).toEqual([agent]);
  });

  it('returns a configuration error before client creation when credentials are missing', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['agents', 'list'], {
      env: { AGENT_WORKBENCH_BASE_URL: 'https://workbench.example.com' },
      stdout: harness.stdout.stream,
      stderr: harness.stderr.stream,
      createClient: harness.createClient
    });

    expect(exitCode).toBe(2);
    expect(harness.stderr.read()).toContain('AGENT_WORKBENCH_API_KEY is required');
    expect(harness.createClient).not.toHaveBeenCalled();
  });

  it('refuses API keys in command-line arguments and does not echo the secret', async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      ['agents', 'list', '--api-key', 'awb_live_should_not_echo'],
      {
        env: {},
        stdout: harness.stdout.stream,
        stderr: harness.stderr.stream,
        createClient: harness.createClient
      }
    );

    expect(exitCode).toBe(2);
    expect(harness.stderr.read()).toContain('AGENT_WORKBENCH_API_KEY');
    expect(harness.stderr.read()).not.toContain('awb_live_should_not_echo');
    expect(harness.createClient).not.toHaveBeenCalled();
  });

  it('maps public API failures to exit code 1 without exposing credentials', async () => {
    const createClient = vi.fn(() => ({
      agents: {
        list: vi.fn(async () => {
          throw new AgentWorkbenchApiError('Invalid or expired API key', 401, 'invalid_api_key');
        })
      }
    }));
    const harness = createHarness(createClient);

    const exitCode = await runCli(['agents', 'list'], {
      env: {
        AGENT_WORKBENCH_API_KEY: 'awb_live_secret',
        AGENT_WORKBENCH_BASE_URL: 'https://workbench.example.com'
      },
      stdout: harness.stdout.stream,
      stderr: harness.stderr.stream,
      createClient
    });

    expect(exitCode).toBe(1);
    expect(harness.stderr.read()).toContain('[401:invalid_api_key]');
    expect(harness.stderr.read()).not.toContain('awb_live_secret');
  });

  it('rejects unknown commands with a usage exit code', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['agents', 'delete'], {
      env: {},
      stdout: harness.stdout.stream,
      stderr: harness.stderr.stream,
      createClient: harness.createClient
    });

    expect(exitCode).toBe(2);
    expect(harness.stderr.read()).toContain('expected command `agents list`');
    expect(harness.createClient).not.toHaveBeenCalled();
  });

  it('prints a stable empty-state message', async () => {
    const createClient = vi.fn(() => ({
      agents: { list: vi.fn(async () => []) }
    }));
    const harness = createHarness(createClient);

    const exitCode = await runCli(['agents', 'list'], {
      env: {
        AGENT_WORKBENCH_API_KEY: 'awb_live_secret',
        AGENT_WORKBENCH_BASE_URL: 'https://workbench.example.com'
      },
      stdout: harness.stdout.stream,
      stderr: harness.stderr.stream,
      createClient
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.read()).toBe('No agents found.\n');
  });
});
