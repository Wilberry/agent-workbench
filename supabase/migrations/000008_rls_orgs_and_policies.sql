-- Migration 000008: RLS policies for organizations, teams, and org-scoped resources

BEGIN;

-- The organization-scoped agent policy below depends on this column. Production
-- already uses agents.organization_id through the SDK, but a fresh migration
-- replay previously reached this file before the column existed.
ALTER TABLE IF EXISTS public.agents
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_organization_id ON public.agents(organization_id);

-- Enable Row Level Security on relevant tables
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agents ENABLE ROW LEVEL SECURITY;

-- Helper function: check org membership
CREATE OR REPLACE FUNCTION public.is_org_member(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om WHERE om.user_id = p_user AND om.org_id = p_org
  );
$$;

-- Allow organization owners and members to SELECT/INSERT/UPDATE (owner can delete)
CREATE POLICY "org_members_can_access_organizations" ON public.organizations
  FOR ALL
  USING (
    owner_id = auth.uid() OR public.is_org_member(auth.uid()::uuid, id)
  )
  WITH CHECK (
    owner_id = auth.uid() OR public.is_org_member(auth.uid()::uuid, id)
  );

-- Teams: allow access for users in the parent organization
CREATE POLICY "org_members_can_access_teams" ON public.teams
  FOR ALL
  USING (
    public.is_org_member(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_member(auth.uid()::uuid, org_id)
  );

-- Organization memberships: only organization members or owners can manage
CREATE POLICY "org_members_manage_memberships" ON public.organization_memberships
  FOR ALL
  USING (
    public.is_org_member(auth.uid()::uuid, org_id)
  )
  WITH CHECK (
    public.is_org_member(auth.uid()::uuid, org_id)
  );

-- Team memberships: only users in the org can manage
CREATE POLICY "team_members_manage" ON public.team_memberships
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.organization_memberships om ON om.org_id = t.org_id
      WHERE t.id = team_memberships.team_id AND om.user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.organization_memberships om ON om.org_id = t.org_id
      WHERE t.id = team_memberships.team_id AND om.user_id = auth.uid()::uuid
    )
  );

-- Agents: allow access if agent.user_id = auth.uid() OR agent belongs to org and user is member
CREATE POLICY "agents_org_scoped" ON public.agents
  FOR ALL
  USING (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  );

-- Agent runs: allow user to see own runs or org members to see org runs
CREATE POLICY "agent_runs_org_scoped" ON public.agent_runs
  FOR ALL
  USING (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  );

COMMIT;
