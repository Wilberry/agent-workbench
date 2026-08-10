-- Restore RLS and least-privilege grants on public application tables.
-- Remove the membership-policy recursion hazard through a non-exposed helper.

BEGIN;

-- Hosted schema compatibility: the repository canonical column is tools.public.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tools' AND column_name = 'is_public'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tools' AND column_name = 'public'
  ) THEN
    ALTER TABLE public.tools RENAME COLUMN is_public TO public;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_org_role(p_user uuid, p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT om.role
  FROM public.organization_memberships AS om
  WHERE p_user IS NOT NULL
    AND p_user = (SELECT auth.uid())
    AND om.user_id = p_user
    AND om.org_id = p_org
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_org_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_org_role(uuid, uuid) TO anon, authenticated, service_role;

-- Compatibility wrappers retained for existing policies/callers.
CREATE OR REPLACE FUNCTION public.is_org_member(p_user uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.current_org_role(p_user, p_org) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager(p_user uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.current_org_role(p_user, p_org) IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(p_user uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.current_org_role(p_user, p_org) = 'owner';
$$;

CREATE OR REPLACE FUNCTION public.can_manage_organization_membership(p_user uuid, p_org uuid, p_target_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE private.current_org_role(p_user, p_org)
    WHEN 'owner' THEN true
    WHEN 'admin' THEN p_target_role IN ('member', 'viewer')
    ELSE false
  END;
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;

-- Organizations: members read, owner/admin update metadata, owner deletes.
DROP POLICY IF EXISTS "org_members_can_access_organizations" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;

CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.is_org_member((SELECT auth.uid())::uuid, id)
  );

CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.is_org_manager((SELECT auth.uid())::uuid, id)
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR public.is_org_manager((SELECT auth.uid())::uuid, id)
  );

CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Memberships: members read; owner/admin mutations are role-aware.
DROP POLICY IF EXISTS "org_members_manage_memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "org_members_select_memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "org_members_insert_memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "org_members_update_memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "org_members_delete_memberships" ON public.organization_memberships;

CREATE POLICY "org_members_select_memberships" ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid())::uuid, org_id)
    OR EXISTS (
      SELECT 1
      FROM public.organizations AS o
      WHERE o.id = organization_memberships.org_id
        AND o.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_members_insert_memberships" ON public.organization_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_organization_membership((SELECT auth.uid())::uuid, org_id, role)
    OR (
      role = 'owner'
      AND user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.organizations AS o
        WHERE o.id = organization_memberships.org_id
          AND o.owner_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "org_members_update_memberships" ON public.organization_memberships
  FOR UPDATE TO authenticated
  USING (
    public.is_org_owner((SELECT auth.uid())::uuid, org_id)
    OR (
      public.is_org_manager((SELECT auth.uid())::uuid, org_id)
      AND role IN ('member', 'viewer')
    )
  )
  WITH CHECK (
    public.is_org_owner((SELECT auth.uid())::uuid, org_id)
    OR (
      public.is_org_manager((SELECT auth.uid())::uuid, org_id)
      AND role IN ('member', 'viewer')
    )
  );

CREATE POLICY "org_members_delete_memberships" ON public.organization_memberships
  FOR DELETE TO authenticated
  USING (
    public.is_org_owner((SELECT auth.uid())::uuid, org_id)
    OR (
      public.is_org_manager((SELECT auth.uid())::uuid, org_id)
      AND role IN ('member', 'viewer')
    )
  );

-- Teams: members read; owner/admin mutate.
DROP POLICY IF EXISTS "org_members_can_access_teams" ON public.teams;
DROP POLICY IF EXISTS "teams_select" ON public.teams;
DROP POLICY IF EXISTS "teams_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_update" ON public.teams;
DROP POLICY IF EXISTS "teams_delete" ON public.teams;

CREATE POLICY "teams_select" ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_org_member((SELECT auth.uid())::uuid, org_id));

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_manager((SELECT auth.uid())::uuid, org_id));

CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE TO authenticated
  USING (public.is_org_manager((SELECT auth.uid())::uuid, org_id))
  WITH CHECK (public.is_org_manager((SELECT auth.uid())::uuid, org_id));

CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE TO authenticated
  USING (public.is_org_manager((SELECT auth.uid())::uuid, org_id));

DROP POLICY IF EXISTS "team_members_manage" ON public.team_memberships;
DROP POLICY IF EXISTS "org_members_manage_team_memberships" ON public.team_memberships;
DROP POLICY IF EXISTS "team_memberships_select" ON public.team_memberships;
DROP POLICY IF EXISTS "team_memberships_insert" ON public.team_memberships;
DROP POLICY IF EXISTS "team_memberships_update" ON public.team_memberships;
DROP POLICY IF EXISTS "team_memberships_delete" ON public.team_memberships;

CREATE POLICY "team_memberships_select" ON public.team_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams AS t
      WHERE t.id = team_memberships.team_id
        AND public.is_org_member((SELECT auth.uid())::uuid, t.org_id)
    )
  );

CREATE POLICY "team_memberships_insert" ON public.team_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams AS t
      WHERE t.id = team_memberships.team_id
        AND public.is_org_manager((SELECT auth.uid())::uuid, t.org_id)
    )
  );

CREATE POLICY "team_memberships_update" ON public.team_memberships
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams AS t
      WHERE t.id = team_memberships.team_id
        AND public.is_org_manager((SELECT auth.uid())::uuid, t.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams AS t
      WHERE t.id = team_memberships.team_id
        AND public.is_org_manager((SELECT auth.uid())::uuid, t.org_id)
    )
  );

CREATE POLICY "team_memberships_delete" ON public.team_memberships
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams AS t
      WHERE t.id = team_memberships.team_id
        AND public.is_org_manager((SELECT auth.uid())::uuid, t.org_id)
    )
  );

-- Tools: public catalog read; authenticated personal/org access; managers mutate org tools.
DROP POLICY IF EXISTS "tools_public_select" ON public.tools;
DROP POLICY IF EXISTS "tools_authenticated_select" ON public.tools;
DROP POLICY IF EXISTS "tools_insert" ON public.tools;
DROP POLICY IF EXISTS "tools_update" ON public.tools;
DROP POLICY IF EXISTS "tools_delete" ON public.tools;

CREATE POLICY "tools_public_select" ON public.tools
  FOR SELECT TO anon
  USING (COALESCE("public", false));

CREATE POLICY "tools_authenticated_select" ON public.tools
  FOR SELECT TO authenticated
  USING (
    COALESCE("public", false)
    OR (org_id IS NULL AND created_by = (SELECT auth.uid()))
    OR (org_id IS NOT NULL AND public.is_org_member((SELECT auth.uid())::uuid, org_id))
  );

CREATE POLICY "tools_insert" ON public.tools
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      org_id IS NULL
      OR public.is_org_manager((SELECT auth.uid())::uuid, org_id)
    )
  );

CREATE POLICY "tools_update" ON public.tools
  FOR UPDATE TO authenticated
  USING (
    (org_id IS NULL AND created_by = (SELECT auth.uid()))
    OR (org_id IS NOT NULL AND public.is_org_manager((SELECT auth.uid())::uuid, org_id))
  )
  WITH CHECK (
    (org_id IS NULL AND created_by = (SELECT auth.uid()))
    OR (org_id IS NOT NULL AND public.is_org_manager((SELECT auth.uid())::uuid, org_id))
  );

CREATE POLICY "tools_delete" ON public.tools
  FOR DELETE TO authenticated
  USING (
    (org_id IS NULL AND created_by = (SELECT auth.uid()))
    OR (org_id IS NOT NULL AND public.is_org_manager((SELECT auth.uid())::uuid, org_id))
  );

-- Runtime audit rows are service-written and readable only through an accessible parent run.
DROP POLICY IF EXISTS "agent_run_events_select" ON public.agent_run_events;
CREATE POLICY "agent_run_events_select" ON public.agent_run_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_runs AS r
      WHERE r.id = agent_run_events.run_id
        AND (
          r.user_id = (SELECT auth.uid())
          OR (
            r.organization_id IS NOT NULL
            AND public.is_org_member((SELECT auth.uid())::uuid, r.organization_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS "tool_calls_select" ON public.tool_calls;
CREATE POLICY "tool_calls_select" ON public.tool_calls
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_runs AS r
      WHERE r.id = tool_calls.run_id
        AND (
          r.user_id = (SELECT auth.uid())
          OR (
            r.organization_id IS NOT NULL
            AND public.is_org_member((SELECT auth.uid())::uuid, r.organization_id)
          )
        )
    )
  );

-- Least-privilege table grants. RLS does not protect TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON TABLE public.organizations FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.organizations FROM authenticated;
REVOKE UPDATE ON TABLE public.organizations FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.organizations TO authenticated;
GRANT UPDATE (name, slug, description, metadata) ON TABLE public.organizations TO authenticated;

REVOKE ALL ON TABLE public.organization_memberships FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.organization_memberships FROM authenticated;
REVOKE UPDATE ON TABLE public.organization_memberships FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.organization_memberships TO authenticated;
GRANT UPDATE (role) ON TABLE public.organization_memberships TO authenticated;

REVOKE ALL ON TABLE public.teams FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.teams FROM authenticated;
REVOKE UPDATE ON TABLE public.teams FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.teams TO authenticated;
GRANT UPDATE (name, slug) ON TABLE public.teams TO authenticated;

REVOKE ALL ON TABLE public.team_memberships FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.team_memberships FROM authenticated;
REVOKE UPDATE ON TABLE public.team_memberships FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.team_memberships TO authenticated;
GRANT UPDATE (role) ON TABLE public.team_memberships TO authenticated;

REVOKE ALL ON TABLE public.tools FROM anon;
GRANT SELECT ON TABLE public.tools TO anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.tools FROM authenticated;
REVOKE UPDATE ON TABLE public.tools FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.tools TO authenticated;
GRANT UPDATE (name, slug, description, entrypoint, input_schema, output_schema, runtime, "public", metadata) ON TABLE public.tools TO authenticated;

REVOKE ALL ON TABLE public.agent_run_jobs FROM anon, authenticated;

REVOKE ALL ON TABLE public.agent_run_events FROM anon;
REVOKE ALL ON TABLE public.agent_run_events FROM authenticated;
GRANT SELECT ON TABLE public.agent_run_events TO authenticated;

REVOKE ALL ON TABLE public.tool_calls FROM anon;
REVOKE ALL ON TABLE public.tool_calls FROM authenticated;
GRANT SELECT ON TABLE public.tool_calls TO authenticated;

-- Queue mutation RPCs are worker-only.
REVOKE EXECUTE ON FUNCTION public.dequeue_agent_run_job() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reclaim_stale_agent_run_jobs(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dequeue_agent_run_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_agent_run_jobs(interval) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.dequeue_evaluation_run_job()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.dequeue_evaluation_run_job() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.dequeue_evaluation_run_job() TO service_role';
  END IF;

  IF to_regprocedure('public.reclaim_stale_evaluation_run_jobs(interval)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reclaim_stale_evaluation_run_jobs(interval) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reclaim_stale_evaluation_run_jobs(interval) TO service_role';
  END IF;
END;
$$;

COMMIT;
