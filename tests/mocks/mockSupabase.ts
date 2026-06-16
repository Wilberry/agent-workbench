import { randomUUID } from 'crypto';

type Row = Record<string, any> & { id?: string };

class Table {
  rows: Row[] = [];

  insert(items: Row[]) {
    const toInsert = items.map((r) => ({ ...r, id: r.id ?? randomUUID() }));
    this.rows.push(...toInsert);
    return {
      select: (_: any) => ({
        single: async () => ({ data: toInsert[0] })
      }),
      data: toInsert
    };
  }

  delete() {
    const self = this;
    return {
      eq: async (key: string, val: any) => {
        self.rows = self.rows.filter((r) => r[key] !== val);
        return { data: null };
      }
    };
  }

  // helpers for query builder usage in tests
  builder() {
    const self = this;

    return {
      insert(items: Row[]) {
        return self.insert(items);
      },
      select(_: any) {
        return {
          eq: async (key: string, val: any) => {
            const found = self.rows.find((r) => r[key] === val) ?? null;
            return { data: found };
          },
          single: async () => ({ data: self.rows.length ? self.rows[0] : null })
        };
      },
      update(obj: Record<string, any>) {
        return {
          eq: async (key: string, val: any) => {
            const updated: Row[] = [];
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
  tables: Record<string, Table> = {};

  constructor() {
    this.tables['conversations'] = new Table();
    this.tables['agent_runs'] = new Table();
    this.tables['agent_run_jobs'] = new Table();
  }

  from(table: string) {
    const tbl = this.tables[table] ?? (this.tables[table] = new Table());
    return tbl.builder();
  }
}

export function createMockSupabaseClient() {
  return new MockSupabase() as any;
}

export default createMockSupabaseClient;
