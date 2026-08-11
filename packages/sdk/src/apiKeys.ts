import type { SupabaseClient } from '@supabase/supabase-js';
import { orgs } from './orgs';
import { createServerSupabaseClient } from './supabaseClient';
import type { Database } from './types';

export const API_KEY_PREFIX = 'awb_live_';
export const PUBLIC_API_SCOPES = ['agents:read'] as const;
export type PublicApiScope = (typeof PUBLIC_API_SCOPES)[number];

export type ApiKeyRecord = {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicApiPrincipal = {
  apiKeyId: string;
  organizationId: string;
  createdBy: string;
  scopes: string[];
};

type ApiKeyClient = SupabaseClient<Database>;

type ApiKeyAuthRow = ApiKeyRecord & {
  key_hash: string;
};

const SAFE_COLUMNS =
  'id, organization_id, created_by, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at, updated_at';

function apiKeyTable(client: ApiKeyClient) {
  // api_keys is intentionally server-only and is not part of the browser-facing
  // typed Data API surface. Keep the cast contained in this module.
  return (client as any).from('api_keys');
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateApiKey() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `${API_KEY_PREFIX}${bytesToHex(bytes)}`;
}

export async function hashApiKey(rawKey: string) {
  const encoded = new TextEncoder().encode(rawKey);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

export function parseBearerApiKey(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return null;
  const rawKey = match[1];
  return rawKey.startsWith(API_KEY_PREFIX) ? rawKey : null;
}

export function hasApiKeyScope(scopes: readonly string[], requiredScope: PublicApiScope) {
  return scopes.includes(requiredScope);
}

function normalizeScopes(scopes?: string[]) {
  const requested = scopes?.length ? scopes : [...PUBLIC_API_SCOPES];
  const unique = [...new Set(requested.map((scope) => scope.trim()).filter(Boolean))];
  const invalid = unique.filter(
    (scope) => !PUBLIC_API_SCOPES.includes(scope as PublicApiScope)
  );
  if (invalid.length > 0) {
    throw new Error(`Unsupported API key scope: ${invalid.join(', ')}`);
  }
  return unique as PublicApiScope[];
}

function normalizeExpiry(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) throw new Error('expiresAt must be a valid timestamp');
  if (timestamp <= Date.now()) throw new Error('expiresAt must be in the future');
  return new Date(timestamp).toISOString();
}

async function assertCanManageApiKeys(
  actorUserId: string,
  organizationId: string,
  client: ApiKeyClient
) {
  const isManager = await orgs.isOrgManager(organizationId, actorUserId, client);
  if (!isManager) throw new Error('Not authorized to manage organization API keys');
}

async function touchLastUsed(row: ApiKeyAuthRow, client: ApiKeyClient) {
  const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (Number.isFinite(lastUsed) && Date.now() - lastUsed < 5 * 60 * 1000) return;

  await apiKeyTable(client)
    .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('revoked_at', null);
}

export const apiKeys = {
  async create(
    actorUserId: string,
    organizationId: string,
    input: { name: string; scopes?: string[]; expiresAt?: string | null },
    client?: ApiKeyClient
  ) {
    const supabase = client ?? createServerSupabaseClient();
    await assertCanManageApiKeys(actorUserId, organizationId, supabase);

    const name = input.name.trim();
    if (!name) throw new Error('API key name is required');
    if (name.length > 100) throw new Error('API key name must be 100 characters or fewer');

    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const scopes = normalizeScopes(input.scopes);
    const expiresAt = normalizeExpiry(input.expiresAt);
    const now = new Date().toISOString();

    const { data, error } = await apiKeyTable(supabase)
      .insert([
        {
          organization_id: organizationId,
          created_by: actorUserId,
          name,
          key_prefix: rawKey.slice(0, 20),
          key_hash: keyHash,
          scopes,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now
        }
      ])
      .select(SAFE_COLUMNS)
      .single();

    if (error) throw error;
    return { apiKey: data as ApiKeyRecord, secret: rawKey };
  },

  async list(actorUserId: string, organizationId: string, client?: ApiKeyClient) {
    const supabase = client ?? createServerSupabaseClient();
    await assertCanManageApiKeys(actorUserId, organizationId, supabase);

    const { data, error } = await apiKeyTable(supabase)
      .select(SAFE_COLUMNS)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ApiKeyRecord[];
  },

  async revoke(actorUserId: string, apiKeyId: string, client?: ApiKeyClient) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: existing, error: existingError } = await apiKeyTable(supabase)
      .select('id, organization_id, revoked_at')
      .eq('id', apiKeyId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw new Error('API key not found');

    await assertCanManageApiKeys(actorUserId, existing.organization_id, supabase);
    if (existing.revoked_at) return { id: apiKeyId, revoked_at: existing.revoked_at };

    const revokedAt = new Date().toISOString();
    const { data, error } = await apiKeyTable(supabase)
      .update({ revoked_at: revokedAt, updated_at: revokedAt })
      .eq('id', apiKeyId)
      .is('revoked_at', null)
      .select('id, revoked_at')
      .single();

    if (error) throw error;
    return data as { id: string; revoked_at: string };
  },

  async authenticate(
    rawKey: string,
    requiredScope?: PublicApiScope,
    client?: ApiKeyClient
  ): Promise<PublicApiPrincipal> {
    if (!rawKey.startsWith(API_KEY_PREFIX)) throw new Error('Invalid API key');

    const supabase = client ?? createServerSupabaseClient();
    const keyHash = await hashApiKey(rawKey);
    const { data, error } = await apiKeyTable(supabase)
      .select(`${SAFE_COLUMNS}, key_hash`)
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (error) throw error;
    const row = data as ApiKeyAuthRow | null;
    if (!row || row.revoked_at) throw new Error('Invalid API key');
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      throw new Error('Invalid API key');
    }
    if (requiredScope && !hasApiKeyScope(row.scopes ?? [], requiredScope)) {
      throw new Error('API key scope denied');
    }

    // Authentication must not fail because usage telemetry could not be written.
    void touchLastUsed(row, supabase).catch(() => {});

    return {
      apiKeyId: row.id,
      organizationId: row.organization_id,
      createdBy: row.created_by,
      scopes: row.scopes ?? []
    };
  }
};
