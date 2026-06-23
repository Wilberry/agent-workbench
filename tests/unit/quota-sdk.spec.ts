import { describe, it, expect, beforeEach } from 'vitest';
import { orgs, QuotaExceededError } from '@agent-workbench/sdk';

class Table {
  rows: any[] = [];
  insert(items: any[]) {
    const toInsert = items.map((r) => ({ ...r, id: r.id ?? String(Math.random()) }));
    this.rows.push(...toInsert);
    return { data: toInsert, error: null };
  }
  select() {
    const self = this;
    return {
      eq: (key: string, val: any) => ({ single: async () => ({ data: self.rows.find((r) => r[key] === val) ?? null }) }),
      single: async () => ({ data: self.rows.length ? this.rows[0] : null })
    };
  }
  delete() {
    const self = this;
    return { eq: async (k: string, v: any) => { self.rows = self.rows.filter((r) => r[k] !== v); return { data: null }; } };
  }
}

class MockSupabase {
  tables: Record<string, Table> = {};
  from(name: string) {
    if (!this.tables[name]) this.tables[name] = new Table();
    const tbl = this.tables[name];
    return {
      insert: (items: any[]) => {
        const inserted = tbl.insert(items).data;
        return {
          select: (_: any) => ({
            single: async () => ({ data: inserted[0], error: null })
          }),
          data: inserted
        };
      },
      select: () => {
        const filters: Array<[string, any]> = [];
        const builder: any = {
          eq: (k: string, v: any) => { filters.push([k, v]); return builder; },
          maybeSingle: async () => {
            let rows = tbl.rows.slice();
            for (const [k, v] of filters) rows = rows.filter((r) => r[k] === v);
            return { data: rows.length ? rows[0] : null };
          },
          single: async () => ({ data: tbl.rows.length ? tbl.rows[0] : null })
        };
        return builder;
      },
      update: (obj: any) => ({ eq: async (k: string, v: any) => { const updated: any[] = []; for (const r of tbl.rows) { if (r[k] === v) { Object.assign(r, obj); updated.push(r); } } return { data: updated }; } }),
      delete: () => tbl.delete()
    };
  }
  async rpc(name: string, params: any) {
    if (name === 'get_organization_quota_usage') {
      // compute reserved/refunded counts
      const org = params.org_id;
      const rows = this.tables['organization_usage_events']?.rows ?? [];
      const total_reserved = rows.filter((r: any) => r.organization_id === org && r.event_type === 'quota_reserved').length;
      const total_refunded = rows.filter((r: any) => r.organization_id === org && r.event_type === 'quota_refunded').length;
      const net_reserved = total_reserved - total_refunded;
      return { data: [{ total_reserved, total_refunded, net_reserved, total_cost: rows.filter((r:any)=>r.organization_id===org).reduce((s:number,x:any)=>s+(x.estimated_cost||0),0) }] };
    }
    if (name === 'reserve_organization_quota') {
      const org = params.organization_id ?? params.org_id ?? params.p_organization_id;
      const runId = params.run_id ?? params.p_run_id;
      const estimated_cost = params.estimated_cost ?? params.p_estimated_cost ?? 0;
      if (!this.tables['organization_usage_events']) this.tables['organization_usage_events'] = new Table();
      const row = {
        id: String(Math.random()).slice(2),
        organization_id: org,
        run_id: runId,
        event_type: 'quota_reserved',
        tokens: 0,
        estimated_cost,
        metadata: { timestamp: new Date().toISOString() },
        created_at: new Date().toISOString()
      };
      this.tables['organization_usage_events'].rows.push(row);
      return { data: [row] };
    }
    if (name === 'get_organization_billing_metrics') {
      const org = params.org_id;
      const rows = this.tables['organization_usage_events']?.rows ?? [];
      const completed = rows.filter((r:any)=>r.organization_id===org && r.event_type==='run_completed');
      const failed = rows.filter((r:any)=>r.organization_id===org && r.event_type==='run_failed');
      return { data: [{ total_runs: completed.length + failed.length, total_tokens: completed.reduce((s:number,x:any)=>s+(x.tokens||0),0), total_cost: completed.reduce((s:number,x:any)=>s+(x.estimated_cost||0),0), completed_runs: completed.length, failed_runs: failed.length }] };
    }
    return { data: null };
  }
}

describe('SDK quota ledger (unit)', () => {
  let supabase: MockSupabase;
  const orgId = 'org-1';
  beforeEach(() => {
    supabase = new MockSupabase();
    // create billing record
    supabase.from('org_billing').insert([{ org_id: orgId, plan: 'free', tokens_used: 0, runs_used: 0 }]);
  });

  it('reserve, complete, failure, and aggregation flow', async () => {
    const runA = 'run-a';
    const runB = 'run-b';
    const runC = 'run-c';

    // reserve three runs
    await orgs.reserveQuota(orgId, runA, { estimatedCost: 0.1 }, supabase as any);
    await orgs.reserveQuota(orgId, runB, { estimatedCost: 0.2 }, supabase as any);
    await orgs.reserveQuota(orgId, runC, { estimatedCost: 0.3 }, supabase as any);

    expect(supabase.tables['organization_usage_events'].rows.length).toBe(3);

    // complete two runs
    await orgs.recordUsageOnCompletion(orgId, runA, { tokens: 100, estimatedCost: 0.1 }, supabase as any);
    await orgs.recordUsageOnCompletion(orgId, runB, { tokens: 200, estimatedCost: 0.2 }, supabase as any);

    // fail one
    await orgs.recordRunFailure(orgId, runC, { reason: 'timeout' }, supabase as any);

    const metrics = await orgs.getBillingMetrics(orgId, supabase as any);
    expect(metrics?.totalRuns).toBe(3);
    expect(metrics?.completedRuns).toBe(2);
    expect(metrics?.failedRuns).toBe(1);
    expect(metrics?.totalTokens).toBe(300);
  });

  it('validateQuota throws QuotaExceededError when over quota', async () => {
    // insert 5 reserved events to hit free plan limit
    for (let i = 0; i < 5; i++) {
      await orgs.reserveQuota(orgId, `r${i}`, { estimatedCost: 0 }, supabase as any);
    }

    try {
      await orgs.validateQuota(orgId, supabase as any);
      throw new Error('expected quota exceeded');
    } catch (err: any) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect((err as any).code).toBe('QUOTA_EXCEEDED');
    }
  });
});
