-- Migration 000017: Add atomic quota reservation RPC for organization usage events

BEGIN;

-- Unique constraint for a single quota reservation per run_id per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_usage_events_quota_reservation_unique ON public.organization_usage_events(organization_id, run_id) WHERE event_type = 'quota_reserved';

CREATE OR REPLACE FUNCTION public.reserve_organization_quota(
  p_organization_id uuid,
  p_run_id uuid,
  p_estimated_cost numeric DEFAULT 0
)
RETURNS public.organization_usage_events AS $$
DECLARE
  plan_text text;
  reserved_count bigint;
  limit_count bigint;
  inserted_row public.organization_usage_events%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

  SELECT plan INTO plan_text
  FROM public.org_billing
  WHERE org_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    plan_text := 'free';
  END IF;

  IF plan_text = 'free' THEN
    limit_count := 5;
  ELSIF plan_text = 'pro' THEN
    limit_count := 1000;
  ELSE
    limit_count := 9223372036854775807;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN event_type = 'quota_reserved' THEN 1 ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN event_type = 'quota_refunded' THEN 1 ELSE 0 END), 0)
    INTO reserved_count
    FROM public.organization_usage_events
    WHERE organization_id = p_organization_id;

  IF reserved_count >= limit_count THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;

  INSERT INTO public.organization_usage_events (
    organization_id,
    run_id,
    event_type,
    tokens,
    estimated_cost,
    metadata
  ) VALUES (
    p_organization_id,
    p_run_id,
    'quota_reserved',
    0,
    COALESCE(p_estimated_cost, 0),
    jsonb_build_object('timestamp', now()::text)
  )
  RETURNING *
  INTO inserted_row;

  RETURN inserted_row;
END;
$$ LANGUAGE plpgsql;

COMMIT;
