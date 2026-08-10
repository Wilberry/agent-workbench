-- Migration 000019: Durable queue support for evaluation run processing

BEGIN;

CREATE TABLE IF NOT EXISTS public.evaluation_run_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id uuid NOT NULL UNIQUE REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_run_jobs_status_created_at
  ON public.evaluation_run_jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_evaluation_run_jobs_user_id
  ON public.evaluation_run_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_run_jobs_org_id
  ON public.evaluation_run_jobs(organization_id);

CREATE OR REPLACE FUNCTION public.update_evaluation_run_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evaluation_run_jobs_updated_at_trigger
BEFORE UPDATE ON public.evaluation_run_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_evaluation_run_jobs_updated_at();

CREATE OR REPLACE FUNCTION public.dequeue_evaluation_run_job()
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
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  claimed_id uuid;
BEGIN
  WITH next_job AS (
    SELECT job.id
    FROM public.evaluation_run_jobs AS job
    WHERE job.status = 'pending'
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

CREATE OR REPLACE FUNCTION public.reclaim_stale_evaluation_run_jobs(
  lease_interval INTERVAL DEFAULT '10 minutes'
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT job.id
    FROM public.evaluation_run_jobs AS job
    WHERE job.status = 'running'
      AND job.locked_at IS NOT NULL
      AND job.locked_at < NOW() - lease_interval
      AND job.attempts < job.max_attempts
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.evaluation_run_jobs AS job
    SET status = 'pending', locked_at = NULL, updated_at = NOW()
    WHERE job.id = rec.id;

    RETURN NEXT rec.id;
  END LOOP;

  RETURN;
END;
$$;

ALTER TABLE public.evaluation_run_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evaluation_run_jobs_owner_or_org_member"
  ON public.evaluation_run_jobs FOR SELECT
  USING (
    user_id = auth.uid()::uuid
    OR (
      organization_id IS NOT NULL
      AND public.is_org_member(auth.uid()::uuid, organization_id)
    )
  );

COMMIT;
