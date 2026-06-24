BEGIN;

CREATE TABLE IF NOT EXISTS public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version_a_id uuid NOT NULL REFERENCES public.agent_versions(id),
  version_b_id uuid NOT NULL REFERENCES public.agent_versions(id),
  dataset_id uuid NOT NULL REFERENCES public.evaluation_datasets(id),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  run_a_id uuid REFERENCES public.evaluation_runs(id) ON DELETE SET NULL,
  run_b_id uuid REFERENCES public.evaluation_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiments_agent_id ON public.experiments(agent_id);
CREATE INDEX IF NOT EXISTS idx_experiments_dataset_id ON public.experiments(dataset_id);
CREATE INDEX IF NOT EXISTS idx_experiments_created_by ON public.experiments(created_by);
CREATE INDEX IF NOT EXISTS idx_experiments_organization_id ON public.experiments(organization_id);

CREATE TRIGGER experiments_updated_at_trigger
BEFORE UPDATE ON public.experiments
FOR EACH ROW EXECUTE FUNCTION public.update_evaluation_updated_at();

ALTER TABLE IF EXISTS public.experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiments_owner_or_org_member"
  ON public.experiments FOR ALL
  USING (
    created_by = auth.uid()::uuid
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  )
  WITH CHECK (
    created_by = auth.uid()::uuid
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid()::uuid, organization_id))
  );

COMMIT;
