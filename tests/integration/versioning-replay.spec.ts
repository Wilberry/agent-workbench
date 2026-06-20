import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServerSupabaseClient, agents, agentRuns } from '@agent-workbench/sdk';
import type { Database } from '@agent-workbench/sdk';
import { createTestAuthUser } from '../utils/createTestAuthUser';

describe('Agent Versioning and Replay', () => {
  let testAgentId: string;
  let testUserId: string;
  let testConversationId: string;
  const supabase = createServerSupabaseClient();

  beforeAll(async () => {
    testUserId = await createTestAuthUser({ email: `versioning-test-${Date.now()}@example.com` });

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: 'Test Org', owner_id: testUserId }])
      .select('id')
      .single();

    if (orgError || !org) {
      throw orgError ?? new Error('Failed to create organization');
    }

    // Create test agent
    const { data: agent } = await supabase
      .from('agents')
      .insert([{
        name: 'Test Agent',
        system_prompt: 'You are a helpful assistant.',
        model: 'gpt-4',
        organization_id: org?.id,
        user_id: testUserId
      }])
      .select('id')
      .single();

    testAgentId = agent?.id || '';

    // Create test conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .insert([{
        agent_id: testAgentId,
        user_id: testUserId,
        title: 'Test Conversation'
      }])
      .select('id')
      .single();

    testConversationId = conversation?.id || '';
  });

  afterAll(async () => {
    // Cleanup would be handled by test database reset
  });

  describe('Agent Versioning', () => {
    it('should create a new agent version with auto-incrementing version_number', async () => {
      const version1 = await agents.createVersion(testAgentId, testUserId, {
        system_prompt: 'Version 1 prompt',
        model: 'gpt-4',
        tools: [],
        workflow: ['step1']
      });

      expect(version1.version_number).toBe(1);
      expect(version1.created_by).toBe(testUserId);
      expect(version1.model).toBe('gpt-4');

      const version2 = await agents.createVersion(testAgentId, testUserId, {
        system_prompt: 'Version 2 prompt',
        model: 'gpt-4-turbo',
        tools: [],
        workflow: ['step1', 'step2']
      });

      expect(version2.version_number).toBe(2);
    });

    it('should list all versions ordered by version_number DESC', async () => {
      const versions = await agents.listVersions(testAgentId);
      expect(versions.length).toBeGreaterThanOrEqual(2);
      expect(versions[0].version_number).toBeGreaterThan(versions[1].version_number);
    });

    it('should get the latest version for an agent', async () => {
      const latest = await agents.getLatestVersion(testAgentId);
      const all = await agents.listVersions(testAgentId);
      expect(latest.version_number).toBe(all[0].version_number);
    });

    it('should get a specific version by ID', async () => {
      const versions = await agents.listVersions(testAgentId);
      const firstVersion = versions[0];

      const retrieved = await agents.getVersion(firstVersion.id);
      expect(retrieved.id).toBe(firstVersion.id);
      expect(retrieved.version_number).toBe(firstVersion.version_number);
    });
  });

  describe('Replay Support', () => {
    let originalRunId: string;
    let version1Id: string;
    let version2Id: string;

    beforeAll(async () => {
      // Create two versions
      const v1 = await agents.createVersion(testAgentId, testUserId, {
        system_prompt: 'Replay test v1',
        model: 'gpt-4',
        tools: [],
        workflow: ['planner', 'executor']
      });
      version1Id = v1.id;

      const v2 = await agents.createVersion(testAgentId, testUserId, {
        system_prompt: 'Replay test v2',
        model: 'gpt-4',
        tools: [],
        workflow: ['planner', 'executor', 'reviewer']
      });
      version2Id = v2.id;

      // Create an original run (simulating completion)
      const { data: run, error: runError } = await supabase
        .from('agent_runs')
        .insert([{
          user_id: testUserId,
          conversation_id: testConversationId,
          workflow: ['planner', 'executor'],
          agent_version_id: version1Id,
          status: 'completed',
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          estimated_cost: 0.001,
          latency_ms: 1000,
          model_name: 'gpt-4',
          execution_trace: []
        }])
        .select('id')
        .single();

      originalRunId = run?.id ?? '';
      if (runError || !originalRunId) {
        throw runError ?? new Error(
          `Setup failed: could not create original run (missing id). Insert result: ${JSON.stringify(
            { runError, run },
            null,
            2
          )}`
        );
      }
    });

    it('should create a replay run linked to original', async () => {
      const runIdToReplay = originalRunId;
      if (!runIdToReplay) {
        throw new Error('Setup failed: original run id missing');
      }
      const replayRun = await agentRuns.replayRun(runIdToReplay, {
        versionId: version2Id,
        reason: 'Testing new version with reviewer step'
      });

      expect(replayRun.replay_of_run_id).toBe(originalRunId);
      expect(replayRun.agent_version_id).toBe(version2Id);
      expect(replayRun.replay_reason).toBe('Testing new version with reviewer step');
      expect(replayRun.status).toBe('pending');
    });

    it('should preserve original run data when replaying', async () => {
      const replay = await agentRuns.replayRun(originalRunId, {
        reason: 'Comparison test'
      });

      const original = await agentRuns.get(originalRunId);
      expect(replay.conversation_id).toBe(original.conversation_id);
      expect(replay.user_id).toBe(original.user_id);
    });

    it('should allow replaying with same version as original', async () => {
      const replay = await agentRuns.replayRun(originalRunId, {
        reason: 'Retry same version'
      });

      const original = await agentRuns.get(originalRunId);
      // Should use original version if not specified
      expect(replay.agent_version_id).toBe(original.agent_version_id);
    });
  });

  describe('End-to-end: Create, Version, and Replay', () => {
    it('should execute full workflow: agent -> version -> run -> replay', async () => {
      // Create agent
      const { data: agent } = await supabase
        .from('agents')
        .insert([{
          name: 'E2E Test Agent',
          system_prompt: 'E2E test',
          model: 'gpt-4',
          user_id: testUserId
        }])
          .select('id')
          .single();
      const agentId = agent?.id || '';

      // Create version
      const version = await agents.createVersion(agentId, testUserId, {
        system_prompt: 'E2E prompt',
        model: 'gpt-4',
        tools: [],
        workflow: ['exec']
      });

      expect(version.version_number).toBe(1);

      // Create conversation
      const { data: conv } = await supabase
        .from('conversations')
        .insert([{
          agent_id: agentId,
          user_id: testUserId,
          title: 'E2E Conv'
        }])
        .select('id')
        .single();

      // Create run with version
      const { data: run } = await supabase
        .from('agent_runs')
        .insert([{
          user_id: testUserId,
          conversation_id: conv?.id,
          workflow: ['exec'],
          agent_version_id: version.id,
          status: 'completed',
          execution_trace: []
        }])
        .select('id')
        .single();

      expect(run?.id).toBeDefined();

      // Create another version
      const version2 = await agents.createVersion(agentId, testUserId, {
        system_prompt: 'E2E prompt v2',
        model: 'gpt-4-turbo',
        tools: [],
        workflow: ['exec', 'review']
      });

      expect(version2.version_number).toBe(2);

      // Replay with new version
      const runToReplay = run?.id ?? '';
      if (!runToReplay) {
        throw new Error('Setup failed: created run has no id');
      }
      const replayRun = await agentRuns.replayRun(runToReplay, {
        versionId: version2.id,
        reason: 'E2E replay test'
      });

      expect(replayRun.replay_of_run_id).toBe(run?.id);
      expect(replayRun.agent_version_id).toBe(version2.id);
    });
  });
});
