import { NextRequest } from 'next/server';
import {
  apiKeys,
  createServerSupabaseClient,
  orgs,
  parseBearerApiKey
} from '@agent-workbench/sdk';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function publicApiError(error: unknown) {
  const message = (error as Error).message;
  if (message === 'API key scope denied') {
    return json(
      { error: { code: 'insufficient_scope', message: 'API key does not have the required scope' } },
      403
    );
  }
  if (message === 'Invalid API key') {
    return json(
      { error: { code: 'invalid_api_key', message: 'Invalid or expired API key' } },
      401
    );
  }
  return json(
    { error: { code: 'internal_error', message: 'Unable to process API request' } },
    500
  );
}

export async function GET(request: NextRequest) {
  const rawKey = parseBearerApiKey(request.headers.get('authorization'));
  if (!rawKey) {
    return json(
      {
        error: {
          code: 'missing_api_key',
          message: 'Use Authorization: Bearer <api-key>'
        }
      },
      401
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const principal = await apiKeys.authenticate(rawKey, 'agents:read', supabase);
    const agents = await orgs.listOrgAgents(principal.organizationId, supabase);

    return json({
      data: agents.map((agent) => ({
        id: agent.id,
        organization_id: agent.organization_id,
        name: agent.name,
        description: agent.description,
        system_prompt: agent.system_prompt,
        model: agent.model,
        provider: agent.provider,
        created_at: agent.created_at
      }))
    });
  } catch (error) {
    return publicApiError(error);
  }
}
