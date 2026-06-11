-- Migration 000011: Durable queue support for agent run processing

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_run_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message text NOT NULL,
  workflow jsonb NOT NULL,
  memories jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_status ON public.agent_run_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_created_at ON public.agent_run_jobs(created_at DESC);

CREATE OR REPLACE FUNCTION public.update_agent_run_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_run_jobs_updated_at_trigger
BEFORE UPDATE ON public.agent_run_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_agent_run_jobs_updated_at();

CREATE OR REPLACE FUNCTION public.dequeue_agent_run_job()
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
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  claimed_id uuid;
BEGIN
  WITH next_job AS (
    SELECT id
    FROM public.agent_run_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.agent_run_jobs
  SET status = 'running', locked_at = NOW(), updated_at = NOW()
  FROM next_job
  WHERE public.agent_run_jobs.id = next_job.id
  RETURNING public.agent_run_jobs.id INTO claimed_id;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.agent_run_jobs WHERE id = claimed_id;
END;
$$;

-- Reclaim stale jobs that were claimed but not completed within the lease window.
CREATE OR REPLACE FUNCTION public.reclaim_stale_agent_run_jobs(lease_interval INTERVAL DEFAULT '5 minutes')
RETURNS TABLE (id uuid) LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.agent_run_jobs
    WHERE status = 'running'
      AND locked_at IS NOT NULL
      AND locked_at < NOW() - lease_interval
      AND attempts < max_attempts
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.agent_run_jobs
    SET status = 'pending', locked_at = NULL, updated_at = NOW()
    WHERE id = rec.id;

    RETURN NEXT rec.id;
  END LOOP;

  RETURN;
END;
$$;

COMMIT;
