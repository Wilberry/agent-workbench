import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { createTestRun } from '../utils/createTestRun';
import { cleanupRuns } from '../utils/cleanupRuns';
import { POST } from '../../apps/web/src/app/api/agent/run/route';

let supabase: ReturnType<typeof createServerSupabaseClient>;
let context: Awaited<ReturnType<typeof createTestRun>> | null = null;

beforeAll(() => {
  supabase = createServerSupabaseClient();
});

afterEach(async () => {
  if (context) {
    await cleanupRuns(context);
    context = null;
  }
});

describe('API route integration', () => {
  it('returns 400 for missing payload on agent run endpoint', async () => {
    const request = new Request('http://localhost/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
  });

  it('creates an agent run with valid payload', async () => {
    context = await createTestRun();
    const payload = {
      userId: context.userId,
      conversationId: context.conversationId,
      message: 'Verify API route success case.',
      workflow: ['Planner', 'Executor', 'Reviewer']
    };

    const request = new Request('http://localhost/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toHaveProperty('runId');
    expect(body.status).toBe('pending');
  });

  it('returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'x', message: 'no conversationId' })
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
  });
});
