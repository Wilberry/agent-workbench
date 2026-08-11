# Agent Workbench CLI

The v0.9 CLI is a thin command-line consumer of the authenticated Agent Workbench public API.

## Current command

```bash
awb agents list --base-url https://your-agent-workbench.example.com
```

Set the API key through the environment:

```bash
export AGENT_WORKBENCH_API_KEY='awb_live_...'
```

You may also set the deployment origin once:

```bash
export AGENT_WORKBENCH_BASE_URL='https://your-agent-workbench.example.com'
awb agents list
```

Use `--json` for machine-readable output:

```bash
awb agents list --json
```

## Security

The CLI intentionally does not accept an API key through `--api-key`. Command-line arguments can be retained in shell history and exposed through process inspection. Keep `awb_live_` credentials in a secret-aware environment or process launcher instead.

The initial CLI is read-only and exposes only the existing `agents list` public API capability. Additional commands should be added only as stable `/api/v1` endpoints and scopes are introduced.

## Repository development

The CLI requires Node 22 and consumes `@agent-workbench/sdk/public`. Its package build performs syntax checks and a real Node help invocation, which also verifies that the public SDK entrypoint is Node-resolvable after the SDK dependency is built.
