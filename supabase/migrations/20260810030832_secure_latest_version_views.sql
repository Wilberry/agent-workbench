-- Enforce caller RLS policies through latest-agent-version views.

BEGIN;

ALTER VIEW public.agent_latest_version SET (security_invoker = true);
ALTER VIEW public.agent_latest_versions SET (security_invoker = true);

-- These views are read models. Preserve SELECT compatibility while removing
-- write-style privileges inherited from older public-schema defaults.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.agent_latest_version, public.agent_latest_versions
  FROM anon, authenticated, service_role;

GRANT SELECT
  ON public.agent_latest_version, public.agent_latest_versions
  TO anon, authenticated, service_role;

COMMIT;
