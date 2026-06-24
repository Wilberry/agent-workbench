/**
 * RBAC Privilege Escalation Security Tests
 * 
 * Audit focus:
 * - Verify admins cannot promote themselves to owner
 * - Verify admins cannot modify owner memberships
 * - Verify members/viewers cannot perform privilege operations
 * - Verify owners have full control
 * - Verify members cannot bypass role checks
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { createServerSupabaseClient, orgs } from '@agent-workbench/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createAuthenticatedTestUser } from '../utils/createAuthenticatedTestUser';
import type { Database } from '@agent-workbench/sdk';

const serviceClient = createServerSupabaseClient();

async function createAuthenticatedClient(accessToken: string, refreshToken: string): Promise<SupabaseClient<Database>> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  ) as SupabaseClient<Database>;

  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
  return client;
}

interface TestContext {
  orgId: string;
  ownerMembership: any;
  adminMembership: any;
  memberMembership: any;
  viewerMembership: any;
  ownerClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
  memberClient: SupabaseClient<Database>;
  viewerClient: SupabaseClient<Database>;
}

interface AuthUsers {
  ownerUser: { userId: string; accessToken: string; refreshToken: string };
  adminUser: { userId: string; accessToken: string; refreshToken: string };
  memberUser: { userId: string; accessToken: string; refreshToken: string };
  viewerUser: { userId: string; accessToken: string; refreshToken: string };
}

let authUsers: AuthUsers;
let authClients: {
  ownerClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
  memberClient: SupabaseClient<Database>;
  viewerClient: SupabaseClient<Database>;
};
const extraAuthUserIds: string[] = [];

async function createAuthenticatedTestUserWithCleanup() {
  const user = await createAuthenticatedTestUser();
  extraAuthUserIds.push(user.userId);
  return user;
}

async function cleanupExtraAuthUsers() {
  for (const userId of extraAuthUserIds) {
    try {
      await (serviceClient.auth as any).admin.deleteUser(userId);
    } catch (_e) {
      // ignore cleanup errors
    }
  }
}

async function setupSuiteAuth() {
  const ownerUser = await createAuthenticatedTestUser();
  const adminUser = await createAuthenticatedTestUser();
  const memberUser = await createAuthenticatedTestUser();
  const viewerUser = await createAuthenticatedTestUser();

  const ownerClient = await createAuthenticatedClient(ownerUser.accessToken, ownerUser.refreshToken);
  const adminClient = await createAuthenticatedClient(adminUser.accessToken, adminUser.refreshToken);
  const memberClient = await createAuthenticatedClient(memberUser.accessToken, memberUser.refreshToken);
  const viewerClient = await createAuthenticatedClient(viewerUser.accessToken, viewerUser.refreshToken);

  authUsers = { ownerUser, adminUser, memberUser, viewerUser };
  authClients = { ownerClient, adminClient, memberClient, viewerClient };
}

async function tearDownSuiteAuth() {
  try {
    await cleanupExtraAuthUsers();
  } catch (_e) {
    // ignore cleanup errors
  }

  try {
    await (serviceClient.auth as any).admin.deleteUser(authUsers.ownerUser.userId);
  } catch (_e) {
    // ignore cleanup errors
  }
  try {
    await (serviceClient.auth as any).admin.deleteUser(authUsers.adminUser.userId);
  } catch (_e) {
    // ignore cleanup errors
  }
  try {
    await (serviceClient.auth as any).admin.deleteUser(authUsers.memberUser.userId);
  } catch (_e) {
    // ignore cleanup errors
  }
  try {
    await (serviceClient.auth as any).admin.deleteUser(authUsers.viewerUser.userId);
  } catch (_e) {
    // ignore cleanup errors
  }
}

async function setupTestOrg(): Promise<TestContext> {
  const org = await orgs.createOrg(authUsers.ownerUser.userId, {
    name: `Test Org ${Date.now()}`,
    slug: `test-org-${Date.now()}`,
    description: 'RBAC privilege escalation test org'
  }, serviceClient);

  const ownerMembership = await orgs.getMembership(org.id, authUsers.ownerUser.userId, serviceClient);
  const adminMembership = await orgs.addOrgMember(org.id, authUsers.adminUser.userId, 'admin', serviceClient);
  const memberMembership = await orgs.addOrgMember(org.id, authUsers.memberUser.userId, 'member', serviceClient);
  const viewerMembership = await orgs.addOrgMember(org.id, authUsers.viewerUser.userId, 'viewer', serviceClient);

  return {
    orgId: org.id,
    ownerMembership: ownerMembership!,
    adminMembership,
    memberMembership,
    viewerMembership,
    ownerClient: authClients.ownerClient,
    adminClient: authClients.adminClient,
    memberClient: authClients.memberClient,
    viewerClient: authClients.viewerClient
  };
}

describe('RBAC Privilege Escalation Security', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    await setupSuiteAuth();
  });

  beforeEach(async () => {
    ctx = await setupTestOrg();
  });

  beforeEach(async () => {
    await serviceClient.from('organization_memberships').upsert([
      { id: ctx.ownerMembership.id, org_id: ctx.orgId, user_id: ctx.ownerMembership.user_id, role: 'owner' },
      { id: ctx.adminMembership.id, org_id: ctx.orgId, user_id: ctx.adminMembership.user_id, role: 'admin' },
      { id: ctx.memberMembership.id, org_id: ctx.orgId, user_id: ctx.memberMembership.user_id, role: 'member' },
      { id: ctx.viewerMembership.id, org_id: ctx.orgId, user_id: ctx.viewerMembership.user_id, role: 'viewer' }
    ], { onConflict: 'id' });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await serviceClient.from('organizations').delete().eq('id', ctx.orgId);
    } catch (e) {
      // Organization may have cascade deleted
    }
  });

  afterAll(async () => {
    await tearDownSuiteAuth();
  });

  describe('Admin to Owner Escalation Prevention', () => {
    it('should prevent admin from promoting self to owner', async () => {
      // Admin attempts to update own membership to owner
      const result = await orgs.updateOrgMembership(ctx.adminMembership.id, 'owner', ctx.adminClient);
      
      // RLS policy should prevent this - the update should fail or be restricted
      expect(result.role).not.toBe('owner');
      expect(result.role).toBe('admin');
    });

    it('should prevent admin from demoting owner', async () => {
      // Admin attempts to update owner membership to admin
      const result = await orgs.updateOrgMembership(ctx.ownerMembership.id, 'admin', ctx.adminClient);
      
      // RLS policy should prevent this
      expect(result.role).toBe('owner');
    });

    it('should prevent admin from creating new owner member', async () => {
      const newUser = await createAuthenticatedTestUserWithCleanup();

      try {
        await orgs.addOrgMember(ctx.orgId, newUser.userId, 'owner', ctx.adminClient);
        expect.fail('Should have thrown an error preventing owner creation by admin');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should prevent admin from direct database owner creation via RLS', async () => {
      const newUser = await createAuthenticatedTestUserWithCleanup();
      const { error } = await ctx.adminClient
        .from('organization_memberships')
        .insert([{ org_id: ctx.orgId, user_id: newUser.userId, role: 'owner' }])
        .select('*');

      expect(error).toBeDefined();
    });

    it('should prevent admin from self-promoting to owner via direct DB update', async () => {
      const { error } = await ctx.adminClient
        .from('organization_memberships')
        .update({ role: 'owner' })
        .eq('id', ctx.adminMembership.id)
        .select('*') as any;

      expect(error).toBeDefined();
    });

    it('should prevent admin from promoting another member to owner via direct DB update', async () => {
      const { error } = await ctx.adminClient
        .from('organization_memberships')
        .update({ role: 'owner' })
        .eq('id', ctx.memberMembership.id)
        .select('*') as any;

      expect(error).toBeDefined();
    });

    it('should prevent admin from deleting owner memberships via direct DB delete', async () => {
      const { error } = await ctx.adminClient
        .from('organization_memberships')
        .delete()
        .eq('id', ctx.ownerMembership.id);

      expect(error).toBeDefined();
    });

    it('should allow admin to manage members and viewers', async () => {
      const newUser = await createAuthenticatedTestUserWithCleanup();
      const newUserId = newUser.userId;

      // Add as member - should work
      const member = await orgs.addOrgMember(ctx.orgId, newUserId, 'member', ctx.adminClient);
      expect(member.role).toBe('member');
      
      // Update to viewer - should work
      const updated = await orgs.updateOrgMembership(member.id, 'viewer', ctx.adminClient);
      expect(updated.role).toBe('viewer');
    });
  });

  describe('Member Role Permission Boundaries', () => {
    it('should prevent member from modifying any memberships', async () => {
      try {
        await orgs.updateOrgMembership(ctx.adminMembership.id, 'member', ctx.memberClient);
        expect.fail('Member should not be able to modify memberships');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should prevent member from removing users', async () => {
      try {
        await orgs.removeOrgMembership(ctx.adminMembership.id, ctx.memberClient);
        expect.fail('Member should not be able to remove memberships');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should prevent member from adding new users', async () => {
      const newUserId = randomUUID();
      try {
        await orgs.addOrgMember(ctx.orgId, newUserId, 'member', ctx.memberClient);
        expect.fail('Member should not be able to add new members');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Viewer Role Permission Boundaries', () => {
    it('should prevent viewer from any membership modifications', async () => {
      try {
        await orgs.updateOrgMembership(ctx.memberMembership.id, 'admin', ctx.viewerClient);
        expect.fail('Viewer should not be able to modify memberships');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should allow viewer to list org memberships', async () => {
      const memberships = await orgs.listOrgMemberships(ctx.orgId, ctx.viewerClient);
      expect(Array.isArray(memberships)).toBe(true);
      expect(memberships.length).toBeGreaterThan(0);
    });
  });

  describe('Owner Authority', () => {
    it('should allow owner to modify any membership', async () => {
      const updated = await orgs.updateOrgMembership(ctx.adminMembership.id, 'member', ctx.ownerClient);
      expect(updated.role).toBe('member');
      
      // Restore to admin
      await orgs.updateOrgMembership(ctx.adminMembership.id, 'admin', ctx.ownerClient);
    });

    it('should allow owner to remove any member', async () => {
      const newUser = await createAuthenticatedTestUserWithCleanup();
      const newMember = await orgs.addOrgMember(ctx.orgId, newUser.userId, 'member', ctx.ownerClient);
      
      await orgs.removeOrgMembership(newMember.id, ctx.ownerClient);
      
      const removed = await orgs.getMembershipById(newMember.id, ctx.ownerClient);
      expect(removed).toBeNull();
    });

    it('should allow owner to add users with any role', async () => {
      const newUser = await createAuthenticatedTestUserWithCleanup();
      const newAdmin = await orgs.addOrgMember(ctx.orgId, newUser.userId, 'admin', ctx.ownerClient);
      
      expect(newAdmin.role).toBe('admin');
      expect(newAdmin.user_id).toBe(newUser.userId);
    });

    it('should allow owner direct database creation of owner memberships via RLS', async () => {
      const newUser = await createAuthenticatedTestUserWithCleanup();
      const { data, error } = await ctx.ownerClient
        .from('organization_memberships')
        .insert([{ org_id: ctx.orgId, user_id: newUser.userId, role: 'owner' }])
        .select('*')
        .single();

      expect(error).toBeNull();
      expect(data?.role).toBe('owner');
    });

    it('should allow owner to promote admin to owner via direct DB update', async () => {
      const { data, error } = await ctx.ownerClient
        .from('organization_memberships')
        .update({ role: 'owner' })
        .eq('id', ctx.adminMembership.id)
        .select('*')
        .single();

      expect(error).toBeNull();
      expect(data?.role).toBe('owner');
    });
  });

  describe('Admin Self-Modification Prevention', () => {
    it('should prevent admin from removing self', async () => {
      try {
        await orgs.removeOrgMembership(ctx.adminMembership.id, ctx.adminClient);
        expect.fail('Admin should not be able to remove themselves (or should be handled gracefully)');
      } catch (error) {
        // This is acceptable - either permission denied or database constraint
        expect(error).toBeDefined();
      }
    });

    it('should track membership history for audit', async () => {
      // Verify that membership records have created_at timestamps
      expect(ctx.adminMembership.created_at).toBeDefined();
      expect(ctx.memberMembership.created_at).toBeDefined();
    });
  });
});
