import { describe, expect, it, vi } from 'vitest';
import {
  getOperationalReadiness,
  hasRequiredServerEnvironment
} from '../../apps/web/src/lib/operationalHealth';

const configuredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key'
};

describe('operational readiness', () => {
  it('requires the complete Supabase server configuration', () => {
    expect(hasRequiredServerEnvironment(configuredEnv)).toBe(true);
    expect(hasRequiredServerEnvironment({
      ...configuredEnv,
      SUPABASE_SERVICE_ROLE_KEY: '   '
    })).toBe(false);
  });

  it('does not probe the database when configuration is incomplete', async () => {
    const checkDatabase = vi.fn(async () => {});

    await expect(getOperationalReadiness({
      env: {},
      checkDatabase
    })).resolves.toEqual({
      status: 'not_ready',
      checks: {
        configuration: 'failed',
        database: 'skipped'
      }
    });

    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it('reports ready only after the database probe succeeds', async () => {
    const checkDatabase = vi.fn(async () => {});

    await expect(getOperationalReadiness({
      env: configuredEnv,
      checkDatabase
    })).resolves.toEqual({
      status: 'ready',
      checks: {
        configuration: 'ok',
        database: 'ok'
      }
    });

    expect(checkDatabase).toHaveBeenCalledTimes(1);
  });

  it('returns a non-secret database failure state', async () => {
    const checkDatabase = vi.fn(async () => {
      throw new Error('postgres://secret-value@example');
    });

    const result = await getOperationalReadiness({
      env: configuredEnv,
      checkDatabase
    });

    expect(result).toEqual({
      status: 'not_ready',
      checks: {
        configuration: 'ok',
        database: 'failed'
      }
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });
});
