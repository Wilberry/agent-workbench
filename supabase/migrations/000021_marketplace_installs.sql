-- Migration 000021: Marketplace install/fork workflow support

BEGIN;

-- Marketplace installs: track which orgs have installed which marketplace agent versions
CREATE TABLE IF NOT EXISTS public.marketplace_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_version_id uuid NOT NULL REFERENCES public.agent_versions(id) ON DELETE CASCADE,
  installed_agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, installed_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_installs_org_id ON public.marketplace_installs(org_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_installs_source_version ON public.marketplace_installs(source_version_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_installs_installed_agent ON public.marketplace_installs(installed_agent_id);

-- Enable RLS for marketplace_installs
ALTER TABLE IF EXISTS public.marketplace_installs ENABLE ROW LEVEL SECURITY;

-- Marketplace installs: only org members can view installs in their org
CREATE POLICY "marketplace_installs_org_member_view" ON public.marketplace_installs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = marketplace_installs.org_id
        AND om.user_id = auth.uid()::uuid
    )
  );

-- Marketplace installs: only managers can create installs in their org
CREATE POLICY "marketplace_installs_org_manager_insert" ON public.marketplace_installs
  FOR INSERT
  WITH CHECK (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );

-- Marketplace installs: only managers can delete installs in their org
CREATE POLICY "marketplace_installs_org_manager_delete" ON public.marketplace_installs
  FOR DELETE
  USING (
    public.is_org_manager(auth.uid()::uuid, org_id)
  );

COMMIT;
