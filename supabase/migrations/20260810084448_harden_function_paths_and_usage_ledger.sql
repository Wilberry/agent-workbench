-- Harden app-owned database functions and the organization usage ledger.
-- Supabase recommends fixed/empty search paths for database functions and
-- explicit EXECUTE grants for remotely callable RPCs.

BEGIN;

-- Semantic-search RPC: keep SECURITY INVOKER semantics while removing all
-- mutable name resolution. pgvector's cosine-distance operator is installed
-- in public on this project, so qualify it explicitly as well.
CREATE OR REPLACE FUNCTION public.match_messages(
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.content,
    1 - (m.embedding OPERATOR(public.<=>) query_embedding) AS similarity
  FROM public.messages AS m
  WHERE m.embedding IS NOT NULL
    AND (
      match_threshold IS NULL
      OR 1 - (m.embedding OPERATOR(public.<=>) query_embedding) >= match_threshold
    )
  ORDER BY m.embedding OPERATOR(public.<=>) query_embedding
  LIMIT match_count;
$$;

-- Queue, billing, and trigger helpers already qualify their relations. Pin
-- their search paths without changing their behavior.
ALTER FUNCTION public.update_agent_runs_updated_at() SET search_path = '';
ALTER FUNCTION public.update_agent_run_jobs_updated_at() SET search_path = '';
ALTER FUNCTION public.dequeue_agent_run_job() SET search_path = '';
ALTER FUNCTION public.reclaim_stale_agent_run_jobs(interval) SET search_path = '';
ALTER FUNCTION public.get_organization_quota_usage(uuid, text) SET search_path = '';
ALTER FUNCTION public.get_organization_billing_metrics(uuid) SET search_path = '';
ALTER FUNCTION public.update_evaluation_updated_at() SET search_path = '';
ALTER FUNCTION public.update_evaluation_run_jobs_updated_at() SET search_path = '';
ALTER FUNCTION public.dequeue_evaluation_run_job() SET search_path = '';
ALTER FUNCTION public.reclaim_stale_evaluation_run_jobs(interval) SET search_path = '';

-- The original quota reservation function used p_* input names while the SDK
-- sends organization_id/run_id/estimated_cost. Recreate the same type signature
-- with the public RPC contract the SDK already uses, and make it service-only.
DROP FUNCTION public.reserve_organization_quota(uuid, uuid, numeric);
CREATE FUNCTION public.reserve_organization_quota(
  organization_id uuid,
  run_id uuid,
  estimated_cost numeric DEFAULT 0
)
RETURNS public.organization_usage_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  plan_text text;
  reserved_count bigint;
  limit_count bigint;
  inserted_row public.organization_usage_events%ROWTYPE;
BEGIN
  PERFORM 1
  FROM public.organizations AS o
  WHERE o.id = $1
  FOR UPDATE;

  SELECT b.plan
  INTO plan_text
  FROM public.org_billing AS b
  WHERE b.org_id = $1
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

  SELECT
      COALESCE(SUM(CASE WHEN e.event_type = 'quota_reserved' THEN 1 ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.event_type = 'quota_refunded' THEN 1 ELSE 0 END), 0)
  INTO reserved_count
  FROM public.organization_usage_events AS e
  WHERE e.organization_id = $1;

  IF reserved_count >= limit_count THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;

  INSERT INTO public.organization_usage_events AS e (
    organization_id,
    run_id,
    event_type,
    tokens,
    estimated_cost,
    metadata
  ) VALUES (
    $1,
    $2,
    'quota_reserved',
    0,
    COALESCE($3, 0),
    pg_catalog.jsonb_build_object('timestamp', pg_catalog.now()::text)
  )
  RETURNING e.* INTO inserted_row;

  RETURN inserted_row;
END;
$$;

-- Explicit RPC execution surface.
REVOKE EXECUTE ON FUNCTION public.match_messages(public.vector, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_messages(public.vector, double precision, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_organization_quota_usage(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_organization_billing_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_quota_usage(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_billing_metrics(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_organization_quota(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_organization_quota(uuid, uuid, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dequeue_agent_run_job() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reclaim_stale_agent_run_jobs(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dequeue_evaluation_run_job() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reclaim_stale_evaluation_run_jobs(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dequeue_agent_run_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_agent_run_jobs(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.dequeue_evaluation_run_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_evaluation_run_jobs(interval) TO service_role;

-- Trigger functions are not application RPCs. Remove anonymous inherited
-- execution while preserving the existing authenticated/service grants.
REVOKE EXECUTE ON FUNCTION public.update_agent_runs_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_agent_run_jobs_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_evaluation_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_evaluation_run_jobs_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agent_runs_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_agent_run_jobs_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_evaluation_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_evaluation_run_jobs_updated_at() TO authenticated, service_role;

-- Billing/quota events are an append-only server ledger. The previous INSERT
-- policy used WITH CHECK (true) for PUBLIC, which allowed anonymous callers to
-- forge ledger events through ordinary Data API writes.
DROP POLICY IF EXISTS "organization_usage_events_service_insert"
  ON public.organization_usage_events;

REVOKE ALL PRIVILEGES ON public.organization_usage_events FROM anon, authenticated;
GRANT SELECT ON public.organization_usage_events TO authenticated;
GRANT ALL PRIVILEGES ON public.organization_usage_events TO service_role;

-- These privileges are not governed by RLS and are unnecessary for Data API
-- application roles. Keep normal CRUD grants/policies intact elsewhere.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Prevent future postgres-owned app migrations from silently restoring the
-- same broad defaults. New authenticated RPCs must opt in with an explicit
-- GRANT EXECUTE.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
