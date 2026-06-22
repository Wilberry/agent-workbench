-- Migration 000016: Add organization usage events table for quota enforcement and billing

BEGIN;

-- Organization usage events table - append-only ledger for billing and quota tracking
CREATE TABLE IF NOT EXISTS public.organization_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('quota_reserved', 'run_completed', 'run_failed', 'quota_refunded')),
  tokens integer NOT NULL DEFAULT 0,
  estimated_cost numeric(12, 6) NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_usage_events_org_id ON public.organization_usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_usage_events_run_id ON public.organization_usage_events(run_id);
CREATE INDEX IF NOT EXISTS idx_organization_usage_events_event_type ON public.organization_usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_organization_usage_events_created_at ON public.organization_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organization_usage_events_org_created ON public.organization_usage_events(organization_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.organization_usage_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organization members can view usage events for their org
CREATE POLICY "organization_usage_events_org_members_view" ON public.organization_usage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = organization_usage_events.organization_id
        AND om.user_id = auth.uid()::uuid
    )
  );

-- RLS Policy: Service role can insert/update (for background workers and API routes)
CREATE POLICY "organization_usage_events_service_insert" ON public.organization_usage_events
  FOR INSERT
  WITH CHECK (true);

-- Helper function: Calculate current quota usage by event type
CREATE OR REPLACE FUNCTION public.get_organization_quota_usage(
  org_id uuid,
  event_type_filter text DEFAULT 'quota_reserved'
)
RETURNS TABLE (
  total_reserved bigint,
  total_refunded bigint,
  net_reserved bigint,
  total_cost numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN e.event_type = 'quota_reserved' THEN 1 ELSE 0 END), 0)::bigint as total_reserved,
    COALESCE(SUM(CASE WHEN e.event_type = 'quota_refunded' THEN 1 ELSE 0 END), 0)::bigint as total_refunded,
    (COALESCE(SUM(CASE WHEN e.event_type = 'quota_reserved' THEN 1 ELSE 0 END), 0) - 
     COALESCE(SUM(CASE WHEN e.event_type = 'quota_refunded' THEN 1 ELSE 0 END), 0))::bigint as net_reserved,
    COALESCE(SUM(e.estimated_cost), 0)::numeric as total_cost
  FROM public.organization_usage_events e
  WHERE e.organization_id = org_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function: Get organization billing metrics from usage events
CREATE OR REPLACE FUNCTION public.get_organization_billing_metrics(org_id uuid)
RETURNS TABLE (
  total_runs bigint,
  total_tokens bigint,
  total_cost numeric,
  completed_runs bigint,
  failed_runs bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(COUNT(DISTINCT CASE WHEN e.event_type IN ('run_completed', 'run_failed') THEN e.run_id END), 0)::bigint as total_runs,
    COALESCE(SUM(e.tokens), 0)::bigint as total_tokens,
    COALESCE(SUM(e.estimated_cost), 0)::numeric as total_cost,
    COALESCE(SUM(CASE WHEN e.event_type = 'run_completed' THEN 1 ELSE 0 END), 0)::bigint as completed_runs,
    COALESCE(SUM(CASE WHEN e.event_type = 'run_failed' THEN 1 ELSE 0 END), 0)::bigint as failed_runs
  FROM public.organization_usage_events e
  WHERE e.organization_id = org_id
    AND e.event_type IN ('run_completed', 'run_failed');
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
