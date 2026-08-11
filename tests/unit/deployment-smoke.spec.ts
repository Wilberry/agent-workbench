import { describe, expect, it, vi } from 'vitest';
import { smokeDeployment } from '../../scripts/ci/smoke-deployment.mjs';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('deployment health smoke check', () => {
  it('checks liveness and readiness on the deployment origin', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith('/api/health/live')) {
        return jsonResponse({ status: 'ok', service: 'agent-workbench-web' });
      }
      if (value.endsWith('/api/health/ready')) {
        return jsonResponse({
          status: 'ready',
          checks: { configuration: 'ok', database: 'ok' }
        });
      }
      return jsonResponse({ error: 'unexpected path' }, 404);
    });

    await expect(smokeDeployment({
      baseUrl: 'https://workbench.example.com/',
      fetchImpl
    })).resolves.toMatchObject({
      live: { status: 'ok' },
      ready: { status: 'ready' }
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://workbench.example.com/api/health/live',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://workbench.example.com/api/health/ready',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('fails when liveness is unavailable', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'down' }, 503));

    await expect(smokeDeployment({
      baseUrl: 'https://workbench.example.com',
      fetchImpl
    })).rejects.toThrow('Health check failed with status 503');
  });

  it('fails when readiness does not report ready', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/health/live')) {
        return jsonResponse({ status: 'ok' });
      }
      return jsonResponse({ status: 'not_ready' });
    });

    await expect(smokeDeployment({
      baseUrl: 'https://workbench.example.com',
      fetchImpl
    })).rejects.toThrow('Readiness response is invalid');
  });

  it('rejects ambiguous or credential-bearing deployment URLs', async () => {
    const fetchImpl = vi.fn();

    await expect(smokeDeployment({
      baseUrl: 'https://user:secret@workbench.example.com',
      fetchImpl
    })).rejects.toThrow('must not include URL credentials');

    await expect(smokeDeployment({
      baseUrl: 'https://workbench.example.com/app',
      fetchImpl
    })).rejects.toThrow('must be an origin without a path');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
