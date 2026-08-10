BEGIN;

ALTER TABLE public.evaluation_runs
  DROP CONSTRAINT IF EXISTS evaluation_runs_status_check;
ALTER TABLE public.evaluation_runs
  ADD CONSTRAINT evaluation_runs_status_check
  CHECK (status IN ('pending','running','completed','failed','cancelled'));
ALTER TABLE public.evaluation_runs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.evaluation_run_jobs
  DROP CONSTRAINT IF EXISTS evaluation_run_jobs_status_check;
ALTER TABLE public.evaluation_run_jobs
  ADD CONSTRAINT evaluation_run_jobs_status_check
  CHECK (status IN ('pending','running','completed','failed','cancelled'));
ALTER TABLE public.evaluation_run_jobs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.experiments
  DROP CONSTRAINT IF EXISTS experiments_status_check;
ALTER TABLE public.experiments
  ADD CONSTRAINT experiments_status_check
  CHECK (status IN ('draft','running','completed','failed','cancelled'));
ALTER TABLE public.experiments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.reject_cancelled_evaluation_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.evaluation_runs AS r
    WHERE r.id = NEW.evaluation_run_id
      AND r.status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'evaluation_run_cancelled' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_cancelled_evaluation_result()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS evaluation_run_results_reject_cancelled
  ON public.evaluation_run_results;
CREATE TRIGGER evaluation_run_results_reject_cancelled
BEFORE INSERT ON public.evaluation_run_results
FOR EACH ROW
EXECUTE FUNCTION public.reject_cancelled_evaluation_result();

COMMIT;
