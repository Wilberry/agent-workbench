-- Latest-version views are not part of the anonymous/public API.
-- Keep authenticated and service-role reads while removing anonymous access.

BEGIN;

REVOKE ALL PRIVILEGES
  ON public.agent_latest_version, public.agent_latest_versions
  FROM anon;

GRANT SELECT
  ON public.agent_latest_version, public.agent_latest_versions
  TO authenticated, service_role;

COMMIT;
