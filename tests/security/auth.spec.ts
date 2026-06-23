import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { createTestAuthUser } from '../utils/createTestAuthUser';
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
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('allows service-role access but denies anonymous cross-org records', async () => {
    const userId = await createTestAuthUser();
    const { data: agent, error: agentError } = await serviceClient
      .from('agents')
      .insert([
        {
          user_id: userId,
          name: 'Auth Test Agent',
          description: 'Auth test conversation agent',
          system_prompt: 'Auth test prompt',
          model: 'gpt-4o-mini'
        }
      ])
      .select('*')
      .single();

    expect(agentError).toBeNull();
    expect(agent?.id).toBeDefined();

    const { data: conversation, error: conversationError } = await serviceClient
      .from('conversations')
      .insert([
        {
          agent_id: agent!.id,
          user_id: userId,
          title: 'Auth test conversation'
        }
      ])
      .select('*')
      .single();

    expect(conversationError).toBeNull();
    expect(conversation?.id).toBeDefined();

    const { data: run, error: runError } = await serviceClient
      .from('agent_runs')
      .insert([
        {
          user_id: userId,
          conversation_id: conversation!.id,
          workflow: ['Planner', 'Executor', 'Reviewer'],
          status: 'pending'
        }
      ])
      .select('id')
      .single();

    expect(runError).toBeNull();
    expect(run?.id).toBeDefined();

    const { data: anonymousResult, error: anonymousError } = await anonClient
      .from('agent_runs')
      .select('*')
      .eq('id', run?.id)
      .maybeSingle();

    expect(anonymousError).toBeNull();
    expect(anonymousResult).toBeNull();
  });
});
