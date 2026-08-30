BEGIN;

DROP POLICY IF EXISTS "Service role bypass agent runs"
ON public.agent_runs;

DROP POLICY IF EXISTS "Service role can update agent runs"
ON public.agent_runs;

DROP POLICY IF EXISTS "Users can insert own agent runs"
ON public.agent_runs;

DROP POLICY IF EXISTS "Users can view own agent runs"
ON public.agent_runs;

DROP POLICY IF EXISTS "agent_runs_org_scoped"
ON public.agent_runs;

DROP POLICY IF EXISTS "agent_runs_owner_or_org_member"
ON public.agent_runs;

CREATE POLICY "agent_runs_owner_or_org_member"
ON public.agent_runs
FOR ALL
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.is_org_member(
      (SELECT auth.uid())::uuid,
      organization_id
    )
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.is_org_member(
      (SELECT auth.uid())::uuid,
      organization_id
    )
  )
);

REVOKE ALL PRIVILEGES
ON TABLE public.agent_runs
FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.agent_runs
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.agent_runs
TO authenticated;

GRANT ALL PRIVILEGES
ON TABLE public.agent_runs
TO service_role;

COMMIT;
