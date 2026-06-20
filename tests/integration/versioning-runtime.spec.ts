import { describe, it, expect, beforeAll } from 'vitest';
import { createServerSupabaseClient, agents, agentRuns } from '@agent-workbench/sdk';
import { enqueueAgentRun } from '@agent-workbench/agent-runtime';
import { createTestAuthUser } from '../utils/createTestAuthUser';

describe('Versioning Integration with Runtime', () => {
  let testAgentId: string;
  let testUserId: string;
  let testConversationId: string;
  let testVersionId: string;
  let testOrganizationId: string;
  const supabase = createServerSupabaseClient();

  beforeAll(async () => {
    testUserId = await createTestAuthUser({ email: `runtime-test-${Date.now()}@example.com` });

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: 'Runtime Test Org', owner_id: testUserId }])
      .select('id')
      .single();

    if (orgError || !org) {
      throw orgError ?? new Error('Failed to create organization');
    }

    testOrganizationId = org?.id || '';

    // Create agent
    const { data: agent } = await supabase
      .from('agents')
      .insert([{
        name: 'Runtime Test Agent',
        system_prompt: 'Test agent',
        model: 'gpt-4',
        organization_id: testOrganizationId,
        user_id: testUserId
      }])
      .select('id')
      .single();

    testAgentId = agent?.id || '';

    // Create version
    const version = await agents.createVersion(testAgentId, testUserId, {
      system_prompt: 'Runtime test version',
      model: 'gpt-4',
      tools: [],
      workflow: ['planner', 'executor']
    });

    testVersionId = version.id;

    // Create conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .insert([{
        agent_id: testAgentId,
        user_id: testUserId,
        title: 'Runtime Test Conv'
      }])
      .select('id')
      .single();

    testConversationId = conversation?.id || '';
  });

  describe('Queue Integration', () => {
    it('should enqueue run with agent version ID', async () => {
      const runId = await enqueueAgentRun({
        runId: '',
        userId: testUserId,
        conversationId: testConversationId,
        message: 'Test message',
        workflow: ['planner', 'executor'],
        memories: [],
        agentVersionId: testVersionId,
        organizationId: testOrganizationId
      });

      expect(runId).toBeDefined();

      // Verify run was created with version ID
      const run = await agentRuns.get(runId);
      expect(run.agent_version_id).toBe(testVersionId);
      expect(run.organization_id).toBe(testOrganizationId);
    });

    it('should handle enqueue without version ID (nullable)', async () => {
      const runId = await enqueueAgentRun({
        runId: '',
        userId: testUserId,
        conversationId: testConversationId,
        message: 'Test without version',
        workflow: ['planner', 'executor'],
        memories: [],
        agentVersionId: null,
        organizationId: testOrganizationId
      });

      expect(runId).toBeDefined();

      const run = await agentRuns.get(runId);
      expect(run.agent_version_id).toBeNull();
    });

    it('should enqueue multiple runs with different versions', async () => {
      // Create second version
      const version2 = await agents.createVersion(testAgentId, testUserId, {
        system_prompt: 'Second version',
        model: 'gpt-4-turbo',
        tools: [],
        workflow: ['planner', 'executor', 'reviewer']
      });

      // Enqueue with first version
      const runId1 = await enqueueAgentRun({
        runId: '',
        userId: testUserId,
        conversationId: testConversationId,
        message: 'With v1',
        workflow: ['planner', 'executor'],
        memories: [],
        agentVersionId: testVersionId,
        organizationId: testOrganizationId
      });

      // Enqueue with second version
      const runId2 = await enqueueAgentRun({
        runId: '',
        userId: testUserId,
        conversationId: testConversationId,
        message: 'With v2',
        workflow: ['planner', 'executor', 'reviewer'],
        memories: [],
        agentVersionId: version2.id,
        organizationId: testOrganizationId
      });

      expect(runId1).toBeDefined();
      expect(runId2).toBeDefined();

      const run1 = await agentRuns.get(runId1);
      const run2 = await agentRuns.get(runId2);

      expect(run1.agent_version_id).toBe(testVersionId);
      expect(run2.agent_version_id).toBe(version2.id);
    });
  });

  describe('Version History Querying', () => {
    it('should retrieve all versions in order', async () => {
      const versions = await agents.listVersions(testAgentId);
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions[0].version_number).toBeGreaterThanOrEqual(versions[versions.length - 1].version_number);
    });

    it('should get latest version', async () => {
      const latest = await agents.getLatestVersion(testAgentId);
      expect(latest).toBeDefined();
      expect(latest.agent_id).toBe(testAgentId);
    });
  });

  describe('Run Telemetry with Versions', () => {
    it('should capture version info in run telemetry', async () => {
      const runId = await enqueueAgentRun({
        runId: '',
        userId: testUserId,
        conversationId: testConversationId,
        message: 'Telemetry test',
        workflow: ['planner', 'executor'],
        memories: [],
        agentVersionId: testVersionId,
        organizationId: testOrganizationId
      });

      const run = await agentRuns.get(runId);
      
      // Verify all telemetry fields can be set
      expect(run).toBeDefined();
      expect(run.agent_version_id).toBe(testVersionId);
      expect(run.user_id).toBe(testUserId);
      expect(run.conversation_id).toBe(testConversationId);
    });
  });
});
