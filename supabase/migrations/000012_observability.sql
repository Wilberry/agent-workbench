-- Migration 000012: Add observability fields and tool call auditing

BEGIN;

ALTER TABLE IF EXISTS public.agent_runs
  ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_name text;

CREATE TABLE IF NOT EXISTS public.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  latency_ms integer NOT NULL DEFAULT 0,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id ON public.tool_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_organization_id ON public.tool_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON public.tool_calls(tool_name);

COMMIT;
