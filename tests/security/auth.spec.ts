import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { randomUUID } from 'crypto';

const serviceClient = createServerSupabaseClient();
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
);

describe('Security validation - authentication and authorization', () => {
  it('prevents anonymous access to protected agent runs', async () => {
    const fakeId = randomUUID();
    const { data, error } = await anonClient
      .from('agent_runs')
      .select('*')
      .eq('id', fakeId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('allows service-role access but denies anonymous cross-org records', async () => {
    const userId = randomUUID();
    const { data: run, error: runError } = await serviceClient
      .from('agent_runs')
      .insert([{
        user_id: userId,
        conversation_id: randomUUID(),
        workflow: ['Planner', 'Executor', 'Reviewer'],
        status: 'pending'
      }])
      .select('id')
      .single();

    expect(runError).toBeNull();
    expect(run?.id).toBeDefined();

    const { data: anonymousResult, error: anonymousError } = await anonClient
      .from('agent_runs')
      .select('*')
      .eq('id', run?.id)
      .single();

    expect(anonymousError).toBeNull();
    expect(anonymousResult).toBeNull();
  });
});
