BEGIN;

-- Evaluation dataset definitions
CREATE TABLE IF NOT EXISTS public.evaluation_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  tags text[] DEFAULT '{}'::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_datasets_user_id ON public.evaluation_datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_datasets_org_id ON public.evaluation_datasets(organization_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_datasets_agent_id ON public.evaluation_datasets(agent_id);

CREATE TABLE IF NOT EXISTS public.evaluation_dataset_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.evaluation_datasets(id) ON DELETE CASCADE,
  example_index integer NOT NULL,
  input jsonb NOT NULL,
  expected_output jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, example_index)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_dataset_examples_dataset_id ON public.evaluation_dataset_examples(dataset_id);

CREATE TABLE IF NOT EXISTS public.evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.evaluation_datasets(id) ON DELETE CASCADE,
  agent_version_id uuid NOT NULL REFERENCES public.agent_versions(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_dataset_id ON public.evaluation_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_agent_version_id ON public.evaluation_runs(agent_version_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_user_id ON public.evaluation_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_org_id ON public.evaluation_runs(organization_id);

CREATE TABLE IF NOT EXISTS public.evaluation_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id uuid NOT NULL REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  example_id uuid NOT NULL REFERENCES public.evaluation_dataset_examples(id) ON DELETE CASCADE,
  agent_output jsonb NOT NULL,
  exact_match boolean NOT NULL DEFAULT false,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_run_id, example_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_run_results_run_id ON public.evaluation_run_results(evaluation_run_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_run_results_example_id ON public.evaluation_run_results(example_id);

-- Shared updated_at trigger for evaluation tables
CREATE OR REPLACE FUNCTION public.update_evaluation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evaluation_datasets_updated_at_trigger
BEFORE UPDATE ON public.evaluation_datasets
FOR EACH ROW EXECUTE FUNCTION public.update_evaluation_updated_at();

CREATE TRIGGER evaluation_dataset_examples_updated_at_trigger
BEFORE UPDATE ON public.evaluation_dataset_examples
FOR EACH ROW EXECUTE FUNCTION public.update_evaluation_updated_at();

CREATE TRIGGER evaluation_runs_updated_at_trigger
BEFORE UPDATE ON public.evaluation_runs
FOR EACH ROW EXECUTE FUNCTION public.update_evaluation_updated_at();

CREATE TRIGGER evaluation_run_results_updated_at_trigger
BEFORE UPDATE ON public.evaluation_run_results
FOR EACH ROW EXECUTE FUNCTION public.update_evaluation_updated_at();

-- Enable RLS for evaluation tables
ALTER TABLE IF EXISTS public.evaluation_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.evaluation_dataset_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.evaluation_run_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evaluation_datasets_owner_or_org_member"
  ON public.evaluation_datasets FOR ALL
  USING (
    user_id = auth.uid()::uuid
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()::uuid
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  );

CREATE POLICY "evaluation_dataset_examples_owner_or_org_member"
  ON public.evaluation_dataset_examples FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_datasets ed
      WHERE ed.id = public.evaluation_dataset_examples.dataset_id
        AND (
          ed.user_id = auth.uid()::uuid
          OR (ed.organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, ed.organization_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluation_datasets ed
      WHERE ed.id = public.evaluation_dataset_examples.dataset_id
        AND (
          ed.user_id = auth.uid()::uuid
          OR (ed.organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, ed.organization_id))
        )
    )
  );

CREATE POLICY "evaluation_runs_owner_or_org_member"
  ON public.evaluation_runs FOR ALL
  USING (
    user_id = auth.uid()::uuid
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()::uuid
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  );

CREATE POLICY "evaluation_run_results_owner_or_org_member"
  ON public.evaluation_run_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_runs er
      WHERE er.id = public.evaluation_run_results.evaluation_run_id
        AND (
          er.user_id = auth.uid()::uuid
          OR (er.organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, er.organization_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluation_runs er
      WHERE er.id = public.evaluation_run_results.evaluation_run_id
        AND (
          er.user_id = auth.uid()::uuid
          OR (er.organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, er.organization_id))
        )
    )
  );

COMMIT;
