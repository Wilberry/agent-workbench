# Public API authentication

Agent Workbench public API requests use organization-scoped API keys issued by an authenticated organization owner or admin.

## Key format and lifecycle

- Keys use the `awb_live_` prefix followed by 256 bits of cryptographically secure random material.
- The raw key is returned only when it is created. Store it immediately in a secret manager or equivalent secure location.
- Agent Workbench stores only the SHA-256 hash used for lookup and a short display prefix. Raw API keys are never persisted.
- Keys may have an expiration timestamp and may be revoked at any time. Revocation is permanent for that credential.
- Keys are organization-scoped. Public API responses are restricted to the key's organization.

## Scopes

The initial public API scope is:

- `agents:read` — list agents belonging to the key's organization.

Unknown scopes are rejected when a key is created. A request without the required scope returns HTTP 403.

## Authentication header

Send the API key in the standard bearer authorization header:

```http
Authorization: Bearer awb_live_<secret>
```

Do not send API keys in URLs or query parameters, and do not log authorization headers.

## Initial endpoint

### `GET /api/v1/agents`

Requires the `agents:read` scope and returns agents belonging to the API key's organization.

Example response:

```json
{
  "data": [
    {
      "id": "...",
      "organization_id": "...",
      "name": "Support Agent",
      "description": "...",
      "system_prompt": "...",
      "model": "gpt-4o-mini",
      "provider": "openai",
      "created_at": "..."
    }
  ]
}
```

Authentication errors use a stable envelope:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid or expired API key"
  }
}
```

Current error codes are `missing_api_key`, `invalid_api_key`, `insufficient_scope`, and `internal_error`.

## Key management

The authenticated web application manages keys through `/api/api-keys` using the existing Supabase user session. Only organization owners and admins may create, list, or revoke organization API keys.

The API key management route is intentionally separate from the public `/api/v1` surface. Public API keys authenticate external clients; Supabase session authentication continues to protect browser management workflows.

## Database security

`public.api_keys` has Row Level Security enabled and has no `anon` or `authenticated` table grants. Only server-side `service_role` access is granted. This prevents browser Data API clients from reading API-key hashes or metadata directly.

The Security Advisor may report `RLS Enabled No Policy` for this table. That informational finding is intentional for the current server-only design because client roles have no table privileges and server access uses the service role.
