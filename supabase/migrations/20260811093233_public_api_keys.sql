BEGIN;

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['agents:read']::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_name_check CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT api_keys_prefix_check CHECK (key_prefix LIKE 'awb_live_%'),
  CONSTRAINT api_keys_hash_check CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT api_keys_scopes_check CHECK (cardinality(scopes) > 0),
  CONSTRAINT api_keys_expiry_check CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX api_keys_organization_id_idx
  ON public.api_keys (organization_id, created_at DESC);
CREATE INDEX api_keys_created_by_idx
  ON public.api_keys (created_by);
CREATE INDEX api_keys_active_lookup_idx
  ON public.api_keys (key_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_keys TO service_role;

COMMENT ON TABLE public.api_keys IS
  'Server-only Agent Workbench public API credentials. Raw secrets are never stored.';

COMMIT;
