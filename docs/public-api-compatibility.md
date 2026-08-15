# Public API Compatibility Policy

This policy defines the compatibility contract for the versioned Agent Workbench public API and its supported SDK/CLI clients.

## Scope

The current public HTTP surface is versioned under `/api/v1` and is described by `docs/openapi-v1.json`.

The v1 compatibility surface includes:

- HTTP method and versioned path
- authentication requirements and authorization semantics
- required response fields and their types
- response envelope structure
- documented HTTP status behavior
- stable error codes
- public SDK behavior that represents the v1 HTTP contract
- CLI JSON output that mirrors the public SDK agent shape

Internal SDK helpers, database schema details, worker internals, UI routes, and implementation-specific error text are not part of the public v1 compatibility contract unless explicitly documented otherwise.

## Backward compatibility within v1

Agent Workbench keeps `/api/v1` backward-compatible for existing clients.

Within v1, the following changes are allowed without creating a new API version:

- adding optional response fields
- adding new endpoints
- adding new optional request parameters
- adding new documented error codes for new failure conditions
- clarifying descriptions or examples without changing runtime behavior

Clients must ignore unknown response fields and should treat error codes as open-ended strings while preserving handling for documented stable codes.

## Breaking changes

The following are breaking changes and require a new API version rather than silently changing `/api/v1`:

- removing or renaming a documented endpoint
- changing an endpoint's HTTP method
- removing or renaming a required response field
- changing the type or nullability of a required response field
- changing the response envelope shape
- removing or renaming a documented stable error code
- reassigning an existing stable error code to materially different semantics
- changing an existing documented failure from one HTTP status class to another in a way that breaks client behavior
- weakening or incompatibly changing authentication or authorization requirements

## Deprecation

A v1 capability may be marked deprecated in documentation and the OpenAPI contract, but a deprecated required field, endpoint, or stable error code is not removed from `/api/v1`.

Removal of a deprecated public contract element occurs only in a later API version. Migration guidance should be published before clients are asked to move to that later version.

## Error-code stability

The currently documented v1 server error codes are:

- `missing_api_key`
- `invalid_api_key`
- `insufficient_scope`
- `internal_error`

These codes are compatibility surface. Their names and core meanings remain stable within v1.

The SDK intentionally preserves server error codes as strings so future additive codes do not require an immediate SDK release merely to avoid parse failure.

## SDK and CLI compatibility

`@agent-workbench/sdk/public` is the supported JavaScript/TypeScript client surface for the public API. The CLI uses that public SDK instead of maintaining a separate HTTP implementation.

For v1:

- `createAgentWorkbenchClient().agents.list()` continues to target `GET /api/v1/agents`
- `PublicApiAgent` continues to contain the required fields frozen in the OpenAPI contract
- `AgentWorkbenchApiError` continues to preserve HTTP status and server error code
- `awb agents list --json` continues to emit the SDK public agent shape as a JSON array

Human-readable CLI formatting is not a machine-readable compatibility surface unless explicitly documented as such.

## Contract verification

Hermetic unit tests verify the checked-in OpenAPI document against the server route behavior, SDK public types/error behavior, and CLI JSON output.

Changes to the public v1 surface should update the OpenAPI document and contract tests in the same pull request.

## Package and release versions

This policy does not require the root package, SDK package, and CLI package to share the same version number, and landing this contract does not itself trigger a version bump.

Package-release synchronization and the repository's final v1.0 release/tag policy are handled by the release-evidence workstream rather than by changing the HTTP compatibility rules above.
