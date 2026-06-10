-- Migration 000010: Multi-tenant marketplace and billing support

BEGIN;

-- Marketplace agents for organization-scoped agent templates
CREATE TABLE IF NOT EXISTS public.marketplace_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  latest_version_id uuid REFERENCES public.agent_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_org_id ON public.marketplace_agents(org_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_visibility ON public.marketplace_agents(visibility);

-- Organization billing and quota tracking
CREATE TABLE IF NOT EXISTS public.org_billing (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  tokens_used bigint NOT NULL DEFAULT 0,
  runs_used bigint NOT NULL DEFAULT 0,
  last_billed timestamptz
);

-- Enable RLS for the new tables
ALTER TABLE IF EXISTS public.marketplace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.org_billing ENABLE ROW LEVEL SECURITY;

-- Marketplace agents: org members can manage, public view allowed for public items
CREATE POLICY "marketplace_agents_org_members_manage" ON public.marketplace_agents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = marketplace_agents.org_id
        AND om.user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = marketplace_agents.org_id
        AND om.user_id = auth.uid()::uuid
    )
  );

CREATE POLICY "marketplace_agents_public_select" ON public.marketplace_agents
  FOR SELECT
  USING (
    visibility = 'public' OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = marketplace_agents.org_id
        AND om.user_id = auth.uid()::uuid
    )
  );

-- Org billing: only org members can view and update billing records
CREATE POLICY "org_billing_org_members" ON public.org_billing
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = org_billing.org_id
        AND om.user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = org_billing.org_id
        AND om.user_id = auth.uid()::uuid
    )
  );

COMMIT;
