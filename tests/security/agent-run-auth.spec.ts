import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeExecution, ExecutionAuthorizationError } from '../../apps/web/src/lib/agentExecutionAuth';

function createAuthzClient(rows: Record<string, any[]>) {
  return {
    from(table: string) {
      let selected = rows[table] ?? [];
      const builder = {
        select() {
          return builder;
        },
        eq(key: string, value: any) {
          selected = selected.filter((row) => row[key] === value);
          return builder;
        },
        async single() {
          const row = selected[0] ?? null;
          return row ? { data: row, error: null } : { data: null, error: { message: 'No rows' } };
        }
      };
      return builder;
    }
  } as any;
}

describe('authorizeExecution', () => {
  const user = { id: 'user-1' } as any;

  it('allows a user to execute their own conversation and agent', async () => {
    const result = await authorizeExecution({
      user,
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      agentVersionId: 'version-1',
      client: createAuthzClient({
        conversations: [{ id: 'conversation-1', agent_id: 'agent-1', user_id: 'user-1' }],
        agents: [{ id: 'agent-1', user_id: 'user-1', organization_id: null }],
        agent_versions: [{ id: 'version-1', agent_id: 'agent-1' }]
      })
    });

    expect(result.conversation.id).toBe('conversation-1');
    expect(result.agent.id).toBe('agent-1');
    expect(result.agentVersion?.id).toBe('version-1');
  });

  it('rejects another user\'s personal conversation', async () => {
    await expect(
      authorizeExecution({
        user,
        agentId: 'agent-1',
        conversationId: 'conversation-2',
        client: createAuthzClient({
          conversations: [{ id: 'conversation-2', agent_id: 'agent-1', user_id: 'user-2' }],
          agents: [{ id: 'agent-1', user_id: 'user-2', organization_id: null }]
        })
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows an organization member to execute an organization agent', async () => {
    const result = await authorizeExecution({
      user,
      agentId: 'agent-org',
      conversationId: 'conversation-org',
      client: createAuthzClient({
        conversations: [{ id: 'conversation-org', agent_id: 'agent-org', user_id: 'user-2' }],
        agents: [{ id: 'agent-org', user_id: 'user-2', organization_id: 'org-1' }],
        organization_memberships: [{ id: 'membership-1', org_id: 'org-1', user_id: 'user-1', role: 'member' }],
        organizations: [{ id: 'org-1', name: 'Org' }]
      })
    });

    expect(result.membership?.id).toBe('membership-1');
    expect(result.organization?.id).toBe('org-1');
  });

  it('rejects a non-member for an organization agent', async () => {
    await expect(
      authorizeExecution({
        user,
        agentId: 'agent-org',
        conversationId: 'conversation-org',
        client: createAuthzClient({
          conversations: [{ id: 'conversation-org', agent_id: 'agent-org', user_id: 'user-2' }],
          agents: [{ id: 'agent-org', user_id: 'user-2', organization_id: 'org-1' }],
          organization_memberships: [],
          organizations: [{ id: 'org-1', name: 'Org' }]
        })
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an agent version that belongs to a different agent', async () => {
    await expect(
      authorizeExecution({
        user,
        agentId: 'agent-1',
        conversationId: 'conversation-1',
        agentVersionId: 'version-2',
        client: createAuthzClient({
          conversations: [{ id: 'conversation-1', agent_id: 'agent-1', user_id: 'user-1' }],
          agents: [{ id: 'agent-1', user_id: 'user-1', organization_id: null }],
          agent_versions: [{ id: 'version-2', agent_id: 'agent-2' }]
        })
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
