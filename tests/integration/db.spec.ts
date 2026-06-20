import { describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { createTestUserWithAgent } from '../utils/createTestUserWithAgent';

const supabase = createServerSupabaseClient();

describe('Database schema validation', () => {
  it('verifies required tables exist', async () => {
    const tablesToCheck = ['agents', 'conversations', 'messages', 'agent_runs', 'organizations', 'tools'];
    for (const tableName of tablesToCheck) {
      const { error } = await supabase
        .from(tableName)
        .select('id')
        .limit(1);

      expect(error).toBeNull();
    }
  });

  it('verifies required columns and constraints for agent_runs', async () => {
    const { error } = await supabase
      .from('agent_runs')
      .select('id, user_id, conversation_id, workflow, current_step, execution_trace, status, agent_version_id, replay_of_run_id, replay_reason')
      .limit(1);

    expect(error).toBeNull();
  });

  it('verifies required columns and constraints for agent_versions', async () => {
    const { error } = await supabase
      .from('agent_versions')
      .select('id, agent_id, version, version_number, system_prompt, workflow, metadata, model, created_by, created_at')
      .limit(1);

    expect(error).toBeNull();
  });

  it('verifies the agent_latest_versions view exists', async () => {
    const { error } = await supabase
      .from('agent_latest_versions')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
  });

  it('returns the deterministic latest version for an agent when version_number ties occur', async () => {
    const agentId = randomUUID();
    const versionOldId = randomUUID();
    const versionNewId = randomUUID();
    const oldCreatedAt = new Date(Date.now() - 60_000).toISOString();
    const newCreatedAt = new Date(Date.now() + 60_000).toISOString();

    const { userId } = await createTestUserWithAgent();
    const insertAgent = await supabase.from('agents').insert([
      {
        id: agentId,
        user_id: userId,
        name: 'Deterministic Latest Version Test Agent',
        description: 'Test agent for deterministic latest-version view.',
        system_prompt: 'Test prompt',
        model: 'gpt-4o-mini'
      }
    ]);
    expect(insertAgent.error).toBeNull();

    const insertVersions = await supabase.from('agent_versions').insert([
      {
        id: versionOldId,
        agent_id: agentId,
        version: 'v1-old',
        version_number: 1,
        system_prompt: 'old prompt',
        workflow: [],
        created_at: oldCreatedAt
      },
      {
        id: versionNewId,
        agent_id: agentId,
        version: 'v1-new',
        version_number: 1,
        system_prompt: 'new prompt',
        workflow: [],
        created_at: newCreatedAt
      }
    ]);
    expect(insertVersions.error).toBeNull();

    const { data, error } = await supabase
      .from('agent_latest_versions')
      .select('id, agent_id, version_number, created_at')
      .eq('agent_id', agentId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(versionNewId);
    expect(new Date(data?.[0]?.created_at ?? '').toISOString()).toBe(newCreatedAt);

    await supabase.from('agent_versions').delete().eq('agent_id', agentId);
    await supabase.from('agents').delete().eq('id', agentId);
  });
});
