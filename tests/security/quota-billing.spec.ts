import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createServerSupabaseClient, orgs } from '@agent-workbench/sdk';
import { createTestUserWithAgent } from '../utils/createTestUserWithAgent';
import { randomUUID } from 'crypto';

const supabase = createServerSupabaseClient();

describe('Quota enforcement and billing', () => {
  let testUserId: string;
  let testAgentId: string;
  let testConversationId: string;
  let testOrganizationId: string;

  beforeEach(async () => {
    const seeded = await createTestUserWithAgent();
    testUserId = seeded.userId;
    testAgentId = seeded.agentId;
    testConversationId = seeded.conversationId;

    // Create org
    const orgData = await orgs.createOrg(testUserId, {
      name: 'Quota Test Org',
      slug: `quota-test-${randomUUID().substring(0, 8)}`
    });

    testOrganizationId = orgData.id;

    // Add user to org
    await supabase.from('organization_memberships').insert([
      { org_id: testOrganizationId, user_id: testUserId, role: 'owner' }
    ]);
  });

  afterEach(async () => {
    // Cleanup
    await supabase.from('organization_usage_events').delete().eq('organization_id', testOrganizationId);
    if (testOrganizationId) {
      await supabase.from('organizations').delete().eq('id', testOrganizationId);
    }
  });

  describe('validateQuota', () => {
    it('should pass validation when under quota', async () => {
      const result = await orgs.validateQuota(testOrganizationId);
      expect(result).toBeDefined();
      expect(result?.plan).toBeDefined();
      expect(result?.quota).toBeGreaterThan(0);
    });

    it('should throw structured error when quota exceeded', async () => {
      // Insert 5 reserved events to max out free plan
      const runIds = Array.from({ length: 5 }, () => randomUUID());
      await supabase.from('organization_usage_events').insert(
        runIds.map((runId) => ({
          organization_id: testOrganizationId,
          run_id: runId,
          event_type: 'quota_reserved',
          tokens: 0,
          estimated_cost: 0
        }))
      );

      // 6th validation should fail
      try {
        await orgs.validateQuota(testOrganizationId);
        expect.fail('Should have thrown quota exceeded error');
      } catch (err: any) {
        expect(err.code).toBe('QUOTA_EXCEEDED');
        expect(err.message).toBe('quota_exceeded');
      }
    });

    it('should handle personal runs without quota', async () => {
      const result = await orgs.validateQuota(null);
      expect(result).toBeNull();
    });
  });

  describe('reserveQuota', () => {
    it('should reserve quota for a run', async () => {
      const runId = randomUUID();
      const reservationId = await orgs.reserveQuota(testOrganizationId, runId, { estimatedCost: 0.1 });

      expect(reservationId).toBeDefined();

      // Verify event was created
      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('run_id', runId)
        .eq('event_type', 'quota_reserved');

      expect(events).toHaveLength(1);
      expect(events?.[0]?.metadata).toBeDefined();
    });

    it('should not require reservation for personal runs', async () => {
      const runId = randomUUID();
      const result = await orgs.reserveQuota(null, runId);
      expect(result).toBeNull();
    });

    it('should track estimated cost in reservation', async () => {
      const runId = randomUUID();
      const estimatedCost = 0.5;
      await orgs.reserveQuota(testOrganizationId, runId, { estimatedCost });

      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('run_id', runId);

      expect(events?.[0]?.estimated_cost).toBe(estimatedCost);
    });
  });

  describe('recordRunUsage', () => {
    it('should record usage when run completes', async () => {
      const runId = randomUUID();
      await orgs.recordRunUsage(testOrganizationId, runId, { tokens: 1000, estimatedCost: 0.5 });

      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('run_id', runId)
        .eq('event_type', 'run_completed');

      expect(events).toHaveLength(1);
      expect(events?.[0]?.tokens).toBe(1000);
      expect(events?.[0]?.estimated_cost).toBe(0.5);
    });

    it('should be idempotent - multiple calls same run_id should not duplicate', async () => {
      const runId = randomUUID();

      // Record usage twice
      await orgs.recordRunUsage(testOrganizationId, runId, { tokens: 1000, estimatedCost: 0.5 });
      await orgs.recordRunUsage(testOrganizationId, runId, { tokens: 1000, estimatedCost: 0.5 });

      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('run_id', runId)
        .eq('event_type', 'run_completed');

      expect(events).toHaveLength(1);
    });

    it('should not record for personal runs', async () => {
      const runId = randomUUID();
      await orgs.recordRunUsage(null, runId, { tokens: 1000, estimatedCost: 0.5 });

      // Should have no effect
      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('run_id', runId);

      expect(events?.length ?? 0).toBe(0);
    });
  });

  describe('recordRunFailure', () => {
    it('should record run failure', async () => {
      const runId = randomUUID();
      await orgs.recordRunFailure(testOrganizationId, runId, { reason: 'Model timeout' });

      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('run_id', runId)
        .eq('event_type', 'run_failed');

      expect(events).toHaveLength(1);
      expect((events?.[0]?.metadata as any)?.reason).toBe('Model timeout');
    });

    it('should be idempotent', async () => {
      const runId = randomUUID();
      await orgs.recordRunFailure(testOrganizationId, runId, { reason: 'Error 1' });
      await orgs.recordRunFailure(testOrganizationId, runId, { reason: 'Error 2' });

      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('run_id', runId)
        .eq('event_type', 'run_failed');

      expect(events).toHaveLength(1);
    });
  });

  describe('concurrent quota reservation safety', () => {
    it('should handle concurrent reservations safely', async () => {
      const runIds = Array.from({ length: 3 }, () => randomUUID());

      // Reserve multiple runs concurrently
      const results = await Promise.all(
        runIds.map((runId) => orgs.reserveQuota(testOrganizationId, runId, { estimatedCost: 0 }))
      );

      expect(results).toHaveLength(3);
      expect(results.every((r) => r !== null)).toBe(true);

      // Verify all were recorded
      const { data: events } = await supabase
        .from('organization_usage_events')
        .select('*')
        .eq('organization_id', testOrganizationId)
        .eq('event_type', 'quota_reserved');

      expect(events).toHaveLength(3);
    });
  });

  describe('billing aggregation', () => {
    it('should aggregate billing metrics correctly', async () => {
      // Create multiple events
      const completedRunIds = Array.from({ length: 2 }, () => randomUUID());
      const failedRunIds = Array.from({ length: 1 }, () => randomUUID());

      await supabase.from('organization_usage_events').insert([
        ...completedRunIds.map((runId) => ({
          organization_id: testOrganizationId,
          run_id: runId,
          event_type: 'run_completed' as const,
          tokens: 500,
          estimated_cost: 0.25
        })),
        ...failedRunIds.map((runId) => ({
          organization_id: testOrganizationId,
          run_id: runId,
          event_type: 'run_failed' as const,
          tokens: 0,
          estimated_cost: 0
        }))
      ]);

      const metrics = await orgs.getBillingMetrics(testOrganizationId);

      expect(metrics?.totalRuns).toBe(3);
      expect(metrics?.completedRuns).toBe(2);
      expect(metrics?.failedRuns).toBe(1);
      expect(metrics?.totalTokens).toBe(1000); // Only completed runs
      expect(metrics?.totalCost).toBe(0.5); // Only completed runs
    });
  });

  describe('quota limits by plan', () => {
    it('should enforce free plan limit (5 runs)', async () => {
      const { data: billing } = await supabase
        .from('org_billing')
        .select('plan')
        .eq('org_id', testOrganizationId)
        .single();

      expect(billing?.plan).toBe('free');

      // Try to exceed limit
      const runIds = Array.from({ length: 6 }, () => randomUUID());
      for (let i = 0; i < 5; i++) {
        await orgs.reserveQuota(testOrganizationId, runIds[i], { estimatedCost: 0 });
      }

      // 6th should fail
      try {
        await orgs.validateQuota(testOrganizationId);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('QUOTA_EXCEEDED');
      }
    });
  });
});
