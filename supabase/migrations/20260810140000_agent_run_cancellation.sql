BEGIN;

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('pending','running','completed','failed','cancelled'));
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.agent_run_jobs
  DROP CONSTRAINT IF EXISTS agent_run_jobs_status_check;
ALTER TABLE public.agent_run_jobs
  ADD CONSTRAINT agent_run_jobs_status_check
  CHECK (status IN ('pending','running','completed','failed','cancelled'));
ALTER TABLE public.agent_run_jobs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMIT;
