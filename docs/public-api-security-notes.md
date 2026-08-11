# Public API key security notes

This note records the initial v0.9 API-key database posture and validation decisions.

## Access model

- `public.api_keys` has Row Level Security enabled.
- `anon` and `authenticated` have no table privileges.
- `service_role` is the only application role granted table access.
- Raw API key material is not stored. The database stores a SHA-256 hash and a short display prefix.
- Key management is authorized in the application using the existing organization owner/admin membership model.

## Advisor result

The Supabase Security Advisor reports `RLS Enabled No Policy` for `public.api_keys` at INFO level. This is intentional for the current server-only table because client roles have no grants and server access uses `service_role`, which bypasses RLS.

A service-role-only RLS policy was considered for documenting intent but is not required for enforcement in the current access model. If the table is ever granted to `anon` or `authenticated`, explicit least-privilege RLS policies must be added before that grant ships.

The project also retains pre-existing advisor findings unrelated to this migration, including the `vector` extension in the public schema and leaked-password protection being disabled.

## Performance result

The new API-key indexes are reported as unused immediately after creation, which is expected before production traffic exercises the new surface. The schema includes covering indexes for organization and creator foreign keys, plus hash lookup indexes for authentication.
