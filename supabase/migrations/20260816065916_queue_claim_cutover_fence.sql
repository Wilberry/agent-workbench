BEGIN;

CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_status_created_at
  ON public.agent_run_jobs(status, created_at ASC);

CREATE OR REPLACE FUNCTION public.dequeue_agent_run_job_after(p_not_before timestamptz)
RETURNS TABLE (
  id uuid,
  run_id uuid,
  user_id uuid,
  conversation_id uuid,
  message text,
  workflow jsonb,
  memories jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  claimed_id uuid;
BEGIN
  IF p_not_before IS NULL THEN
    RAISE EXCEPTION 'p_not_before must not be null' USING ERRCODE = '22023';
  END IF;

  WITH next_job AS (
    SELECT job.id
    FROM public.agent_run_jobs AS job
    WHERE job.status = 'pending'
      AND job.created_at >= p_not_before
    ORDER BY job.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.agent_run_jobs AS job
  SET status = 'running', locked_at = NOW(), updated_at = NOW()
  FROM next_job
  WHERE job.id = next_job.id
  RETURNING job.id INTO claimed_id;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    job.id,
    job.run_id,
    job.user_id,
    job.conversation_id,
    job.message,
    job.workflow,
    job.memories,
    job.status,
    job.created_at,
    job.updated_at
  FROM public.agent_run_jobs AS job
  WHERE job.id = claimed_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_stale_agent_run_jobs_after(
  p_not_before timestamptz,
  p_lease_interval interval DEFAULT '5 minutes'
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF p_not_before IS NULL THEN
    RAISE EXCEPTION 'p_not_before must not be null' USING ERRCODE = '22023';
  END IF;

  FOR rec IN
    SELECT job.id
    FROM public.agent_run_jobs AS job
    WHERE job.status = 'running'
      AND job.created_at >= p_not_before
      AND job.locked_at IS NOT NULL
      AND job.locked_at < NOW() - p_lease_interval
      AND job.attempts < job.max_attempts
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.agent_run_jobs AS job
    SET status = 'pending', locked_at = NULL, updated_at = NOW()
    WHERE job.id = rec.id;

    id := rec.id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_evaluation_run_job_after(p_not_before timestamptz)
RETURNS TABLE (
  id uuid,
  evaluation_run_id uuid,
  user_id uuid,
  organization_id uuid,
  status text,
  attempts integer,
  max_attempts integer,
  locked_at timestamptz,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  claimed_id uuid;
BEGIN
  IF p_not_before IS NULL THEN
    RAISE EXCEPTION 'p_not_before must not be null' USING ERRCODE = '22023';
  END IF;

  WITH next_job AS (
    SELECT job.id
    FROM public.evaluation_run_jobs AS job
    WHERE job.status = 'pending'
      AND job.created_at >= p_not_before
    ORDER BY job.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.evaluation_run_jobs AS job
  SET status = 'running', locked_at = NOW(), updated_at = NOW()
  FROM next_job
  WHERE job.id = next_job.id
  RETURNING job.id INTO claimed_id;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    job.id,
    job.evaluation_run_id,
    job.user_id,
    job.organization_id,
    job.status,
    job.attempts,
    job.max_attempts,
    job.locked_at,
    job.error_message,
    job.created_at,
    job.updated_at
  FROM public.evaluation_run_jobs AS job
  WHERE job.id = claimed_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_stale_evaluation_run_jobs_after(
  p_not_before timestamptz,
  p_lease_interval interval DEFAULT '10 minutes'
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF p_not_before IS NULL THEN
    RAISE EXCEPTION 'p_not_before must not be null' USING ERRCODE = '22023';
  END IF;

  FOR rec IN
    SELECT job.id
    FROM public.evaluation_run_jobs AS job
    WHERE job.status = 'running'
      AND job.created_at >= p_not_before
      AND job.locked_at IS NOT NULL
      AND job.locked_at < NOW() - p_lease_interval
      AND job.attempts < job.max_attempts
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.evaluation_run_jobs AS job
    SET status = 'pending', locked_at = NULL, updated_at = NOW()
    WHERE job.id = rec.id;

    id := rec.id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.dequeue_agent_run_job_after(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reclaim_stale_agent_run_jobs_after(timestamptz, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dequeue_evaluation_run_job_after(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reclaim_stale_evaluation_run_jobs_after(timestamptz, interval) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dequeue_agent_run_job_after(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_agent_run_jobs_after(timestamptz, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.dequeue_evaluation_run_job_after(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_evaluation_run_jobs_after(timestamptz, interval) TO service_role;

COMMIT;
