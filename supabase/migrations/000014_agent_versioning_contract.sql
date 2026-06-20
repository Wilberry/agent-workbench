-- Migration 000014: Align agent versioning schema with current contract

BEGIN;

ALTER TABLE IF EXISTS public.agent_runs
  ADD COLUMN IF NOT EXISTS agent_version_id uuid REFERENCES public.agent_versions(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.agent_versions
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gpt-4o-mini';

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_version_id ON public.agent_runs(agent_version_id);

-- Deterministic canonical latest-version view
CREATE OR REPLACE VIEW public.agent_latest_version AS
SELECT DISTINCT ON (agent_id)
  *
FROM public.agent_versions
ORDER BY agent_id, version_number DESC, created_at DESC, id DESC;

-- Compatibility alias for legacy callers
CREATE OR REPLACE VIEW public.agent_latest_versions AS
SELECT * FROM public.agent_latest_version;

COMMIT;
