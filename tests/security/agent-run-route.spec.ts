import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertedMessages: any[] = [];
const enqueueAgentRun = vi.fn();
const getRelevantMemories = vi.fn();
const routeAuthorizeExecution = vi.fn();

class MockExecutionAuthorizationError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

async function loadRoute() {
  vi.resetModules();
  vi.doMock('@agent-workbench/agent-runtime', () => ({
    enqueueAgentRun,
    getRelevantMemories
  }));
  vi.doMock('@agent-workbench/sdk', async () => {
    const actual = await vi.importActual<typeof import('@agent-workbench/sdk')>('@agent-workbench/sdk');
    return {
      ...actual,
      createServerSupabaseClient: () => ({
        from: (table: string) => ({
          insert: (items: any[]) => {
            if (table === 'messages') insertedMessages.push(...items);
            return { select: () => ({ single: async () => ({ data: { id: 'message-1' }, error: null }) }) };
          }
        })
      })
    };
  });
  vi.doMock('../../apps/web/src/lib/agentExecutionAuth', () => ({
    authorizeExecution: routeAuthorizeExecution,
    ExecutionAuthorizationError: MockExecutionAuthorizationError
  }));
  return import('../../apps/web/src/app/api/agent/run/route');
}

describe('POST /api/agent/run authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedMessages.length = 0;
    getRelevantMemories.mockResolvedValue([]);
    enqueueAgentRun.mockResolvedValue('run-1');
    routeAuthorizeExecution.mockResolvedValue({
      user: { id: 'auth-user' },
      conversation: { id: 'conversation-1', agent_id: 'agent-1', user_id: 'auth-user' },
      agent: { id: 'agent-1', user_id: 'auth-user', organization_id: null },
      organization: null,
      membership: null,
      agentVersion: { id: 'version-1', agent_id: 'agent-1' }
    });
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { handleAgentRun } = await loadRoute();
    const authClient = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };

    const response = await handleAgentRun(new Request('http://localhost/api/agent/run', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'agent-1', conversationId: 'conversation-1', message: 'hello' })
    }) as any, authClient as any);

    expect(response.status).toBe(401);
    expect(enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('queues runs with authenticated user ID and ignores spoofed body userId', async () => {
    const { handleAgentRun } = await loadRoute();
    const authClient = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user' } } }) } };

    const response = await handleAgentRun(new Request('http://localhost/api/agent/run', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'spoofed-user',
        agentId: 'agent-1',
        conversationId: 'conversation-1',
        agentVersionId: 'version-1',
        message: 'hello'
      })
    }) as any, authClient as any);

    expect(response.status).toBe(202);
    expect(routeAuthorizeExecution).toHaveBeenCalledWith({
      user: { id: 'auth-user' },
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      agentVersionId: 'version-1'
    });
    expect(enqueueAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'auth-user',
      conversationId: 'conversation-1',
      agentVersionId: 'version-1'
    }));
    expect(enqueueAgentRun).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'spoofed-user' }));
  });

  it('maps authorization failures to 403', async () => {
    routeAuthorizeExecution.mockRejectedValue(new MockExecutionAuthorizationError('Forbidden', 403));
    const { handleAgentRun } = await loadRoute();
    const authClient = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user' } } }) } };

    const response = await handleAgentRun(new Request('http://localhost/api/agent/run', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'agent-1', conversationId: 'conversation-1', message: 'hello' })
    }) as any, authClient as any);

    expect(response.status).toBe(403);
    expect(enqueueAgentRun).not.toHaveBeenCalled();
  });
});
