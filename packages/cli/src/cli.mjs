import {
  AgentWorkbenchApiError,
  createAgentWorkbenchClient
} from '@agent-workbench/sdk/public';

const HELP = `Agent Workbench CLI

Usage:
  awb agents list [--base-url <url>] [--json]
  awb --help

Environment:
  AGENT_WORKBENCH_API_KEY   Required API key. Kept out of command-line arguments.
  AGENT_WORKBENCH_BASE_URL Optional deployment origin when --base-url is omitted.

Commands:
  agents list              List agents visible to the API key's organization.
`;

function sanitizeCell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

function formatAgentsTable(agents) {
  if (agents.length === 0) return 'No agents found.';

  const rows = [
    ['ID', 'NAME', 'PROVIDER', 'MODEL'],
    ...agents.map((agent) => [
      sanitizeCell(agent.id),
      sanitizeCell(agent.name),
      sanitizeCell(agent.provider),
      sanitizeCell(agent.model)
    ])
  ];
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => row[index].length))
  );

  return rows
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd())
    .join('\n');
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true, json: false, baseUrl: undefined, command: [] };
  }

  const command = [];
  let json = false;
  let baseUrl;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--base-url') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--base-url requires a URL value');
      }
      baseUrl = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      const value = arg.slice('--base-url='.length);
      if (!value) throw new Error('--base-url requires a URL value');
      baseUrl = value;
      continue;
    }
    if (arg === '--api-key' || arg.startsWith('--api-key=')) {
      throw new Error('API keys must be supplied through AGENT_WORKBENCH_API_KEY, not command-line arguments');
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    command.push(arg);
  }

  return { help: false, json, baseUrl, command };
}

function writeLine(stream, value = '') {
  stream.write(`${value}\n`);
}

export async function runCli(args, options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const createClient = options.createClient ?? createAgentWorkbenchClient;

  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    writeLine(stderr, `Error: ${error instanceof Error ? error.message : 'Invalid arguments'}`);
    writeLine(stderr, 'Run `awb --help` for usage.');
    return 2;
  }

  if (parsed.help) {
    stdout.write(HELP);
    return 0;
  }

  if (parsed.command.length !== 2 || parsed.command[0] !== 'agents' || parsed.command[1] !== 'list') {
    writeLine(stderr, 'Error: expected command `agents list`.');
    writeLine(stderr, 'Run `awb --help` for usage.');
    return 2;
  }

  const apiKey = env.AGENT_WORKBENCH_API_KEY?.trim();
  const baseUrl = (parsed.baseUrl ?? env.AGENT_WORKBENCH_BASE_URL)?.trim();

  if (!apiKey) {
    writeLine(stderr, 'Error: AGENT_WORKBENCH_API_KEY is required.');
    return 2;
  }
  if (!baseUrl) {
    writeLine(stderr, 'Error: provide --base-url or AGENT_WORKBENCH_BASE_URL.');
    return 2;
  }

  let client;
  try {
    client = createClient({ baseUrl, apiKey });
  } catch (error) {
    writeLine(stderr, `Error: ${error instanceof Error ? error.message : 'Invalid client configuration'}`);
    return 2;
  }

  try {
    const agents = await client.agents.list();
    if (parsed.json) {
      writeLine(stdout, JSON.stringify(agents, null, 2));
    } else {
      writeLine(stdout, formatAgentsTable(agents));
    }
    return 0;
  } catch (error) {
    if (error instanceof AgentWorkbenchApiError) {
      const status = error.status > 0 ? `${error.status}:` : '';
      writeLine(stderr, `Agent Workbench API error [${status}${error.code}]: ${error.message}`);
      return 1;
    }

    writeLine(stderr, `Agent Workbench CLI error: ${error instanceof Error ? error.message : 'Request failed'}`);
    return 1;
  }
}

export { HELP as CLI_HELP };
