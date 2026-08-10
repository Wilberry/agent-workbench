BEGIN;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai';
ALTER TABLE public.agent_versions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai';
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS provider_name text;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_provider_format_check;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_provider_format_check
  CHECK (provider = lower(provider) AND provider ~ '^[a-z0-9][a-z0-9._-]*$');

ALTER TABLE public.agent_versions
  DROP CONSTRAINT IF EXISTS agent_versions_provider_format_check;
ALTER TABLE public.agent_versions
  ADD CONSTRAINT agent_versions_provider_format_check
  CHECK (provider = lower(provider) AND provider ~ '^[a-z0-9][a-z0-9._-]*$');

CREATE OR REPLACE VIEW public.agent_latest_version
WITH (security_invoker = true) AS
SELECT DISTINCT ON (agent_id)
  *
FROM public.agent_versions
ORDER BY agent_id, version_number DESC, created_at DESC, id DESC;

CREATE OR REPLACE VIEW public.agent_latest_versions
WITH (security_invoker = true) AS
SELECT * FROM public.agent_latest_version;

REVOKE ALL PRIVILEGES ON public.agent_latest_version, public.agent_latest_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.agent_latest_version, public.agent_latest_versions
  FROM authenticated, service_role;
GRANT SELECT ON public.agent_latest_version, public.agent_latest_versions TO authenticated, service_role;

COMMIT;
