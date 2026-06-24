-- Migration 000020: RBAC support for organization membership and org-scoped resources

BEGIN;

-- Add a stricter role constraint for organization memberships and support viewer role
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organization_memberships'::regclass
      AND conname IN ('organization_memberships_role_check', 'chk_organization_memberships_role')
  ) THEN
    ALTER TABLE public.organization_memberships
      DROP CONSTRAINT IF EXISTS organization_memberships_role_check;
    ALTER TABLE public.organization_memberships
      DROP CONSTRAINT IF EXISTS chk_organization_memberships_role;
  END IF;

  ALTER TABLE public.organization_memberships
    ADD CONSTRAINT chk_organization_memberships_role
    CHECK (role IN ('owner', 'admin', 'member', 'viewer'));
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists; ignore concurrent or repeated runs.
  NULL;
END;
$$;

-- Helper function: check org manager role
CREATE OR REPLACE FUNCTION public.is_org_manager(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user
      AND om.org_id = p_org
      AND om.role IN ('owner', 'admin')
  );
$$;

-- Organization memberships: enforce role-aware management policies
CREATE OR REPLACE FUNCTION public.is_org_owner(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = p_user
      AND om.org_id = p_org
      AND om.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_organization_membership(p_user uuid, p_org uuid, p_target_role text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = p_user
        AND om.org_id = p_org
        AND om.role = 'owner'
    ) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.user_id = p_user
        AND om.org_id = p_org
        AND om.role = 'admin'
    ) THEN p_target_role IN ('member', 'viewer')
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "org_members_manage_memberships" ON public.organization_memberships;
CREATE POLICY "org_members_select_memberships" ON public.organization_memberships
  FOR SELECT
  USING (
    public.is_org_member(auth.uid()::uuid, org_id)
  );

CREATE POLICY "org_members_insert_memberships" ON public.organization_memberships
  FOR INSERT
  WITH CHECK (
    public.can_manage_organization_membership(auth.uid()::uuid, org_id, role)
  );

CREATE POLICY "org_members_update_memberships" ON public.organization_memberships
  FOR UPDATE
  USING (
    public.is_org_owner(auth.uid()::uuid, org_id)
    OR (
      public.is_org_manager(auth.uid()::uuid, org_id)
      AND role IN ('member', 'viewer')
    )
  )
  WITH CHECK (
    public.is_org_owner(auth.uid()::uuid, org_id)
    OR (
      public.is_org_manager(auth.uid()::uuid, org_id)
      AND role IN ('member', 'viewer')
    )
  );

CREATE POLICY "org_members_delete_memberships" ON public.organization_memberships
  FOR DELETE
  USING (
    public.is_org_owner(auth.uid()::uuid, org_id)
    OR (
      public.is_org_manager(auth.uid()::uuid, org_id)
      AND role IN ('member', 'viewer')
    )
  );

-- Agents: allow org members to select and only managers to insert/update/delete
DROP POLICY IF EXISTS "agents_org_scoped" ON public.agents;
CREATE POLICY "agents_org_select" ON public.agents
  FOR SELECT
  USING (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  );

CREATE POLICY "agents_org_manage" ON public.agents
  FOR ALL
  USING (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_manager(auth.uid()::uuid, organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()::uuid OR (organization_id IS NOT NULL AND public.is_org_manager(auth.uid()::uuid, organization_id))
  );

-- Marketplace agents: only managers can modify listings
DROP POLICY IF EXISTS "marketplace_agents_org_members_manage" ON public.marketplace_agents;
CREATE POLICY "marketplace_agents_org_manage" ON public.marketplace_agents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = marketplace_agents.org_id
        AND om.user_id = auth.uid()::uuid
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = marketplace_agents.org_id
        AND om.user_id = auth.uid()::uuid
        AND om.role IN ('owner', 'admin')
    )
  );

-- Org billing: members can view; only managers can update billing records
DROP POLICY IF EXISTS "org_billing_org_members" ON public.org_billing;
CREATE POLICY "org_billing_org_members_select" ON public.org_billing
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = org_billing.org_id
        AND om.user_id = auth.uid()::uuid
    )
  );

CREATE POLICY "org_billing_org_managers_modify" ON public.org_billing
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = org_billing.org_id
        AND om.user_id = auth.uid()::uuid
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = org_billing.org_id
        AND om.user_id = auth.uid()::uuid
        AND om.role IN ('owner', 'admin')
    )
  );

COMMIT;
