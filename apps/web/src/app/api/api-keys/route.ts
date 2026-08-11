import { NextRequest } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createRouteHandlerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { apiKeys, createServerSupabaseClient } from '@agent-workbench/sdk';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorStatus(message: string) {
  if (message === 'Not authenticated') return 401;
  if (message.startsWith('Not authorized')) return 403;
  if (
    message.includes('required') ||
    message.includes('must be') ||
    message.startsWith('Unsupported API key scope') ||
    message === 'API key not found'
  ) {
    return 400;
  }
  return 500;
}

async function authenticatedUserId(
  authClient = createRouteHandlerSupabaseClient({ headers, cookies })
) {
  const { data } = await authClient.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId();
    const organizationId = request.nextUrl.searchParams.get('organizationId')?.trim();
    if (!organizationId) return json({ error: 'organizationId is required' }, 400);

    const supabase = createServerSupabaseClient();
    const keys = await apiKeys.list(userId, organizationId, supabase);
    return json({ data: keys });
  } catch (error) {
    const message = (error as Error).message;
    return json({ error: message }, errorStatus(message));
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticatedUserId();
    const body = await request.json();
    const organizationId = typeof body.organizationId === 'string'
      ? body.organizationId.trim()
      : '';
    const name = typeof body.name === 'string' ? body.name : '';
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((scope: unknown): scope is string => typeof scope === 'string')
      : undefined;
    const expiresAt = typeof body.expiresAt === 'string' || body.expiresAt === null
      ? body.expiresAt
      : undefined;

    if (!organizationId) return json({ error: 'organizationId is required' }, 400);

    const supabase = createServerSupabaseClient();
    const created = await apiKeys.create(
      userId,
      organizationId,
      { name, scopes, expiresAt },
      supabase
    );

    return json(
      {
        data: created.apiKey,
        secret: created.secret,
        warning: 'Store this API key securely. It will not be shown again.'
      },
      201
    );
  } catch (error) {
    const message = (error as Error).message;
    return json({ error: message }, errorStatus(message));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await authenticatedUserId();
    const body = await request.json();
    const apiKeyId = typeof body.apiKeyId === 'string' ? body.apiKeyId.trim() : '';
    if (!apiKeyId) return json({ error: 'apiKeyId is required' }, 400);

    const supabase = createServerSupabaseClient();
    const result = await apiKeys.revoke(userId, apiKeyId, supabase);
    return json({ data: result });
  } catch (error) {
    const message = (error as Error).message;
    return json({ error: message }, errorStatus(message));
  }
}
