import { NextRequest } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServerSupabaseClient, evaluations } from '@agent-workbench/sdk';

async function hasOrganizationAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  organizationId: string | null | undefined
) {
  if (!organizationId) return false;
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('id')
    .eq('org_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function authorizeEvaluationTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  datasetId: string,
  agentVersionId: string,
  requestedOrganizationId?: string | null
): Promise<{ organizationId: string | null }> {
  const { data: dataset, error: datasetError } = await supabase
    .from('evaluation_datasets')
    .select('id,user_id,organization_id,agent_id')
    .eq('id', datasetId)
    .maybeSingle();
  if (datasetError) throw datasetError;
  if (!dataset) throw new Error('Evaluation dataset not found');

  const datasetAuthorized =
    dataset.user_id === userId ||
    await hasOrganizationAccess(supabase, userId, dataset.organization_id);
  if (!datasetAuthorized) throw new Error('Not authorized to use this evaluation dataset');

  if (requestedOrganizationId && requestedOrganizationId !== dataset.organization_id) {
    throw new Error('Evaluation organization must match the dataset organization');
  }

  const { data: version, error: versionError } = await supabase
    .from('agent_versions')
    .select('id,agent_id')
    .eq('id', agentVersionId)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) throw new Error('Agent version not found');

  if (dataset.agent_id && dataset.agent_id !== version.agent_id) {
    throw new Error('Agent version does not belong to the evaluation dataset agent');
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id,user_id,organization_id')
    .eq('id', version.agent_id)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) throw new Error('Agent not found');

  const agentAuthorized =
    agent.user_id === userId ||
    await hasOrganizationAccess(supabase, userId, agent.organization_id);
  if (!agentAuthorized) throw new Error('Not authorized to evaluate this agent');

  if (
    dataset.organization_id &&
    agent.organization_id &&
    dataset.organization_id !== agent.organization_id
  ) {
    throw new Error('Evaluation dataset and agent must belong to the same organization');
  }

  return { organizationId: dataset.organization_id ?? null };
}

async function handlePost(request: NextRequest, authClient = createRouteHandlerSupabaseClient({ headers, cookies })) {
  try {
    const body = await request.json();
    const { data: user } = await authClient.auth.getUser();
    const authUser = user?.user ?? null;
    if (!authUser) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    if (!body.datasetId || !body.agentVersionId) {
      return new Response(JSON.stringify({ error: 'datasetId and agentVersionId are required' }), { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { organizationId } = await authorizeEvaluationTarget(
      supabase,
      authUser.id,
      body.datasetId,
      body.agentVersionId,
      body.organizationId ?? null
    );

    const { run } = await evaluations.createEvaluationRun(
      authUser.id,
      {
        datasetId: body.datasetId,
        agentVersionId: body.agentVersionId,
        organizationId
      },
      supabase
    );

    return new Response(
      JSON.stringify({
        run,
        runId: run.id,
        status: run.status,
        message: 'Evaluation run queued for background execution'
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    const message = (err as Error).message;
    const forbidden = message.startsWith('Not authorized');
    const notFound = message.endsWith('not found');
    const badRequest = message.includes('must match') || message.includes('does not belong');
    const status = forbidden ? 403 : notFound ? 404 : badRequest ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), { status });
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
