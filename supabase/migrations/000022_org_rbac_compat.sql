-- Migration 000022: compatibility patch for org RBAC and organization schema

BEGIN;

-- Ensure organization schema supports current fields used by the SDK and UI.
ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Repair stale membership role constraints so viewer support works.
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.organization_memberships
    DROP CONSTRAINT IF EXISTS organization_memberships_role_check;
  ALTER TABLE IF EXISTS public.organization_memberships
    DROP CONSTRAINT IF EXISTS chk_organization_memberships_role;

  ALTER TABLE IF EXISTS public.organization_memberships
    ADD CONSTRAINT chk_organization_memberships_role
    CHECK (role IN ('owner', 'admin', 'member', 'viewer'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

COMMIT;
