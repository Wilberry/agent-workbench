BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.agent_runs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('pending','running','completed','failed','cancelled'));
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.agent_run_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.agent_run_jobs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE public.agent_run_jobs
  ADD CONSTRAINT agent_run_jobs_status_check
  CHECK (status IN ('pending','running','completed','failed','cancelled'));
ALTER TABLE public.agent_run_jobs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMIT;
