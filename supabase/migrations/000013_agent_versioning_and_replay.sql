-- Migration 000013: Agent versioning enhancements and replay support

BEGIN;

-- Add versioning fields to agent_versions table
ALTER TABLE IF EXISTS public.agent_versions
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add replay tracking to agent_runs table
ALTER TABLE IF EXISTS public.agent_runs
  ADD COLUMN IF NOT EXISTS replay_of_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_replay boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS replay_reason text;

-- Create indexes for versioning and replay queries
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id_version ON public.agent_versions(agent_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_agent_versions_created_by ON public.agent_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_agent_runs_replay_of_run_id ON public.agent_runs(replay_of_run_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_is_replay ON public.agent_runs(is_replay);

-- Create view for latest agent version per agent
CREATE OR REPLACE VIEW public.agent_latest_version AS
SELECT DISTINCT ON (agent_id)
  *
FROM public.agent_versions
ORDER BY agent_id, version_number DESC;

-- Enable RLS on agent_versions if not already enabled
ALTER TABLE IF EXISTS public.agent_versions ENABLE ROW LEVEL SECURITY;

-- RLS policy for agent_versions: users can view versions of agents they can access

DROP POLICY IF EXISTS "agent_versions_org_scoped" ON public.agent_versions;

CREATE POLICY "agent_versions_org_scoped"
ON public.agent_versions
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.agents a
    WHERE a.id = agent_versions.agent_id
      AND (
        a.user_id = auth.uid()::uuid
        OR (
          a.organization_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.organization_memberships om
            WHERE om.user_id = auth.uid()::uuid
              AND om.org_id = a.organization_id
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.agents a
    WHERE a.id = agent_versions.agent_id
      AND (
        a.user_id = auth.uid()::uuid
        OR (
          a.organization_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.organization_memberships om
            WHERE om.user_id = auth.uid()::uuid
              AND om.org_id = a.organization_id
          )
        )
      )
  )
);

COMMIT;
