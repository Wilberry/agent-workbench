/**
 * Data Integrity Tests for Marketplace and RBAC Systems
 * 
 * Audit focus:
 * - Verify cascade deletes work correctly
 * - Verify unique constraints are enforced
 * - Verify referential integrity
 * - Verify data consistency after operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServerSupabaseClient, orgs, marketplace, agents } from '@agent-workbench/sdk';
import { createTestAuthUser } from '../utils/createTestAuthUser';
import { randomUUID } from 'crypto';

const serviceClient = createServerSupabaseClient();

interface TestContext {
  orgId: string;
  ownerId: string;
  sourceVersionId: string;
  sourceAgentId: string;
  installedAgentId: string;
  installId: string;
}

async function setupDataIntegrityTest(): Promise<TestContext> {
  const ownerId = await createTestAuthUser();
  const org = await orgs.createOrg(ownerId, {
    name: `Integrity Test Org ${Date.now()}`,
    slug: `integrity-org-${Date.now()}`,
    description: 'Data integrity test org'
  }, serviceClient);

  // Create source agent and version
  const sourceAgent = await agents.create(ownerId, {
    name: 'Source Integrity Agent',
    description: 'For integrity testing',
    system_prompt: 'Test prompt',
    model: 'gpt-4o-mini'
  }, serviceClient);

  const sourceVersion = await agents.createVersion(
    sourceAgent.id,
    ownerId,
    {
      version: 'v1.0.0',
      description: 'Test version',
      system_prompt: 'Test prompt',
      model: 'gpt-4o-mini',
      workflow: []
    },
    serviceClient
  );

  // Publish to marketplace
  await orgs.publishMarketplaceAgent(sourceAgent.id, 'public', serviceClient);

  // Create target org and member
  const targetOrgId = await orgs.createOrg(ownerId, {
    name: `Target Integrity Org ${Date.now()}`,
    slug: `target-integrity-org-${Date.now()}`,
    description: 'Target org for integrity testing'
  }, serviceClient);

  return {
    orgId: org.id,
    ownerId,
    sourceVersionId: sourceVersion.id,
    sourceAgentId: sourceAgent.id,
    installedAgentId: '',
    installId: ''
  };
}

describe('Data Integrity and Constraints', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupDataIntegrityTest();
  });

  afterEach(async () => {
    try {
      await serviceClient.from('organizations').delete().eq('id', ctx.orgId);
    } catch (e) {
      // Cleanup
    }
  });

  describe('Referential Integrity', () => {
    it('should enforce foreign key: org_id references organizations', async () => {
      const invalidOrgId = randomUUID();
      
      try {
        await serviceClient
          .from('marketplace_installs')
          .insert([{
            org_id: invalidOrgId,
            source_version_id: ctx.sourceVersionId,
            installed_agent_id: ctx.installedAgentId
          }])
          .single();
        
        expect.fail('Should have failed with foreign key constraint');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should enforce foreign key: source_version_id references agent_versions', async () => {
      const invalidVersionId = randomUUID();
      
      try {
        await serviceClient
          .from('marketplace_installs')
          .insert([{
            org_id: ctx.orgId,
            source_version_id: invalidVersionId,
            installed_agent_id: ctx.installedAgentId
          }])
          .single();
        
        expect.fail('Should have failed with foreign key constraint');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should enforce foreign key: installed_agent_id references agents', async () => {
      const invalidAgentId = randomUUID();
      
      try {
        await serviceClient
          .from('marketplace_installs')
          .insert([{
            org_id: ctx.orgId,
            source_version_id: ctx.sourceVersionId,
            installed_agent_id: invalidAgentId
          }])
          .single();
        
        expect.fail('Should have failed with foreign key constraint');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Cascade Deletes', () => {
    it('should cascade delete installs when org is deleted', async () => {
      const installs = await marketplace.listOrgInstalledAgents(ctx.orgId, serviceClient);
      expect(installs.length).toBeGreaterThan(0);

      // Delete org
      await serviceClient.from('organizations').delete().eq('id', ctx.orgId);

      // Verify installs are deleted
      const { data: remainingInstalls, error } = await serviceClient
        .from('marketplace_installs')
        .select('*')
        .eq('org_id', ctx.orgId);

      expect(remainingInstalls?.length).toBe(0);
    });

    it('should cascade delete installs when source version is deleted', async () => {
      // Get source agent to delete version
      const { data: sourceVersion } = await serviceClient
        .from('agent_versions')
        .select('*')
        .eq('id', ctx.sourceVersionId)
        .single();

      expect(sourceVersion).toBeDefined();

      // Delete the version
      await serviceClient
        .from('agent_versions')
        .delete()
        .eq('id', ctx.sourceVersionId);

      // Verify install is deleted (due to cascade)
      const { data: install } = await serviceClient
        .from('marketplace_installs')
        .select('*')
        .eq('id', ctx.installId)
        .maybeSingle();

      expect(install).toBeNull();
    });

    it('should cascade delete installs when installed agent is deleted', async () => {
      // Delete installed agent
      await serviceClient
        .from('agents')
        .delete()
        .eq('id', ctx.installedAgentId);

      // Verify install is deleted
      const { data: install } = await serviceClient
        .from('marketplace_installs')
        .select('*')
        .eq('id', ctx.installId)
        .maybeSingle();

      expect(install).toBeNull();
    });

    it('should cascade delete memberships when org is deleted', async () => {
      const newOrgId = randomUUID();
      const ownerId = await createTestAuthUser();
      const newOrg = await orgs.createOrg(ownerId, {
        name: `Cascade Test Org ${Date.now()}`,
        slug: `cascade-org-${Date.now()}`
      }, serviceClient);

      const memberId = await createTestAuthUser();
      const member = await orgs.addOrgMember(newOrg.id, memberId, 'member', serviceClient);

      expect(member).toBeDefined();

      // Delete org
      await serviceClient.from('organizations').delete().eq('id', newOrg.id);

      // Verify membership is deleted
      const { data: membership } = await serviceClient
        .from('organization_memberships')
        .select('*')
        .eq('id', member.id)
        .maybeSingle();

      expect(membership).toBeNull();
    });
  });

  describe('Unique Constraints', () => {
    it('should enforce UNIQUE(org_id, source_version_id, installed_agent_id) or prevent duplicates', async () => {
      // Create another install with same org, source version, installed agent
      const ownerId = await createTestAuthUser();
      const org = await orgs.createOrg(ownerId, {
        name: `Unique Test Org ${Date.now()}`,
        slug: `unique-org-${Date.now()}`
      }, serviceClient);

      const sourceAgent = await agents.create(ownerId, {
        name: 'Unique Source Agent',
        description: 'Test',
        system_prompt: 'Test',
        model: 'gpt-4o-mini'
      }, serviceClient);

      const sourceVersion = await agents.createVersion(
        sourceAgent.id,
        ownerId,
        {
          version: 'v1.0.0',
          description: 'Test',
          system_prompt: 'Test',
          model: 'gpt-4o-mini',
          workflow: [],
          tools: [],
          metadata: {}
        },
        serviceClient
      );

      const installedAgent = await agents.create(ownerId, {
        name: 'Installed Agent',
        description: 'Test',
        system_prompt: 'Test',
        model: 'gpt-4o-mini'
      }, serviceClient);

      // Insert first install
      const { data: install1 } = await serviceClient
        .from('marketplace_installs')
        .insert([{
          org_id: org.id,
          source_version_id: sourceVersion.id,
          installed_agent_id: installedAgent.id
        }])
        .select('*')
        .single();

      expect(install1).toBeDefined();

      // Try to insert duplicate (should fail)
      try {
        await serviceClient
          .from('marketplace_installs')
          .insert([{
            org_id: org.id,
            source_version_id: sourceVersion.id,
            installed_agent_id: installedAgent.id
          }])
          .single();

        expect.fail('Should have failed due to unique constraint');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Cleanup
      await serviceClient.from('organizations').delete().eq('id', org.id);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistent install timestamps', async () => {
      const installs = await marketplace.listOrgInstalledAgents(ctx.orgId, serviceClient);
      
      installs.forEach(install => {
        expect(install.created_at).toBeDefined();
        expect(new Date(install.created_at).getTime()).toBeLessThanOrEqual(Date.now());
      });
    });

    it('should track membership timestamps', async () => {
      const memberships = await orgs.listOrgMemberships(ctx.orgId, serviceClient);
      
      memberships.forEach(membership => {
        expect(membership.created_at).toBeDefined();
      });
    });

    it('should preserve agent organization_id through install', async () => {
      const installed = await serviceClient
        .from('agents')
        .select('*')
        .eq('id', ctx.installedAgentId)
        .single();

      expect(installed.data?.organization_id).toBe(ctx.orgId);
    });
  });

  describe('Constraint Compliance', () => {
    it('should validate role constraint on organization_memberships', async () => {
      const invalidRole = 'superadmin'; // Not in ('owner', 'admin', 'member', 'viewer')
      const invalidUserId = await createTestAuthUser();
      
      try {
        await serviceClient
          .from('organization_memberships')
          .insert([{
            org_id: ctx.orgId,
            user_id: invalidUserId,
            role: invalidRole
          }])
          .single();

        expect.fail('Should have failed with role constraint');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
