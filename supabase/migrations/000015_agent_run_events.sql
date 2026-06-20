-- Migration 000015: Add agent_run_events table for execution observability

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id ON public.agent_run_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_event_type ON public.agent_run_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_created_at ON public.agent_run_events(created_at DESC);

COMMIT;
