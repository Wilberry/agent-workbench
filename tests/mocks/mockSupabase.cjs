const { randomUUID } = require('crypto');

class Table {
  constructor() {
    this.rows = [];
  }
  insert(items) {
    const toInsert = items.map((r) => ({ ...r, id: r.id ?? randomUUID() }));
    this.rows.push(...toInsert);
    return {
      select: (_) => ({
        single: async () => ({ data: toInsert[0] })
      }),
      data: toInsert
    };
  }
  delete() {
    const self = this;
    return {
      eq: async (key, val) => {
        self.rows = self.rows.filter((r) => r[key] !== val);
        return { data: null };
      }
    };
  }
  builder() {
    const self = this;
    return {
      insert(items) {
        return self.insert(items);
      },
      select(_) {
        return {
          eq: (key, val) => ({
            single: async () => {
              const found = self.rows.find((r) => r[key] === val) ?? null;
              return { data: found };
            }
          }),
          single: async () => ({ data: self.rows.length ? self.rows[0] : null })
        };
      },
      delete() {
        return {
          eq: async (key, val) => {
            self.rows = self.rows.filter((r) => r[key] !== val);
            return { data: null };
          }
        };
      },
      update(obj) {
        return {
          eq: async (key, val) => {
            const updated = [];
            for (const r of self.rows) {
              if (r[key] === val) {
                Object.assign(r, obj);
                updated.push(r);
              }
            }
            return { data: updated };
          }
        };
      }
    };
  }
}

class MockSupabase {
  constructor() {
    this.tables = {};
    this.tables['conversations'] = new Table();
    this.tables['agent_runs'] = new Table();
    this.tables['agent_run_jobs'] = new Table();
  }
  from(table) {
    const tbl = this.tables[table] ?? (this.tables[table] = new Table());
    return tbl.builder();
  }
  rpc(name, params) {
    // emulate dequeue and reclaim behavior
    if (name === 'dequeue_agent_run_job') {
      const jobs = this.tables['agent_run_jobs'].rows;
      const idx = jobs.findIndex((j) => j.status === 'pending');
      if (idx === -1) return { data: null };
      const job = jobs[idx];
      job.status = 'running';
      job.locked_at = new Date().toISOString();
      return { data: job };
    }

    if (name === 'reclaim_stale_agent_run_jobs') {
      const lease = params?.lease_interval || '5 minutes';
      const m = /^(\d+)\s*minutes?/.exec(lease);
      const minutes = m ? parseInt(m[1], 10) : 5;
      const cutoff = Date.now() - minutes * 60 * 1000;
      const reclaimed = [];
      for (const j of this.tables['agent_run_jobs'].rows) {
        if (j.status === 'running' && j.locked_at) {
          const locked = new Date(j.locked_at).getTime();
          if (locked < cutoff) {
            j.status = 'pending';
            j.locked_at = null;
            reclaimed.push(j);
          }
        }
      }
      return { data: reclaimed };
    }

    return { data: null };
  }
}

function createMockSupabaseClient() {
  return new MockSupabase();
}

module.exports = { createMockSupabaseClient };
