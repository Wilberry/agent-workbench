import { describe, expect, it } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

const supabase = createServerSupabaseClient();

describe('Database schema validation', () => {
  it('verifies required tables exist', async () => {
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .in('table_name', ['agents', 'conversations', 'messages', 'agent_runs', 'organizations', 'tools']);

    expect(tablesError).toBeNull();
    expect(tables).toBeDefined();
    expect(Array.isArray(tables)).toBe(true);
    expect(tables?.length).toBeGreaterThanOrEqual(6);
  });

  it('verifies required columns and constraints for agent_runs', async () => {
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'agent_runs');

    expect(columnsError).toBeNull();
    const columnNames = (columns ?? []).map((item: any) => item.column_name);
    expect(columnNames).toEqual(expect.arrayContaining(['id', 'user_id', 'conversation_id', 'workflow', 'current_step', 'execution_trace', 'status']));
  });
});
