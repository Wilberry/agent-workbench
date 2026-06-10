-- Migration 000009: Add agents_versions table and tools registry

BEGIN;

-- Agent versions table to support versioned prompts and metadata
CREATE TABLE IF NOT EXISTS public.agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  workflow jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON public.agent_versions(agent_id);

-- Tools registry for discoverable, versioned tools
CREATE TABLE IF NOT EXISTS public.tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  entrypoint text NOT NULL, -- e.g. URL or lambda identifier
  input_schema jsonb DEFAULT NULL,
  output_schema jsonb DEFAULT NULL,
  runtime jsonb DEFAULT NULL,
  public boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tools_org_id ON public.tools(org_id);
CREATE INDEX IF NOT EXISTS idx_tools_public ON public.tools(public);

COMMIT;
