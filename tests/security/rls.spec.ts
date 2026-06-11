import { afterEach, describe, expect, it } from 'vitest';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const serviceClient = createServerSupabaseClient();
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
);

const createdRows: string[] = [];

afterEach(async () => {
  for (const id of createdRows) {
    await serviceClient.from('agents').delete().eq('id', id);
  }
  createdRows.length = 0;
});

describe('Security validation - RLS isolation', () => {
  it('denies anonymous read access for agent rows', async () => {
    const userId = randomUUID();
    const orgId = randomUUID();

    const { data: agent, error: agentError } = await serviceClient
      .from('agents')
      .insert([
        {
          user_id: userId,
          name: 'Org A Agent',
          description: 'Testing cross-org denial',
          system_prompt: 'Keep output isolated.',
          model: 'gpt-4o-mini',
          organization_id: orgId
        }
      ])
      .select('id')
      .single();

    expect(agentError).toBeNull();
    expect(agent?.id).toBeDefined();
    createdRows.push(agent!.id);

    const { data: anonAgent, error: anonError } = await anonClient
      .from('agents')
      .select('*')
      .eq('id', agent!.id)
      .single();

    expect(anonError).toBeNull();
    expect(anonAgent).toBeNull();
  });
});
