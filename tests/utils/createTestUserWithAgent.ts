import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { randomUUID } from 'crypto';
import { createTestAuthUser } from './createTestAuthUser';

export async function createTestUserWithAgent(userId?: string, agentId?: string) {
  const supabase = createServerSupabaseClient();
  const resolvedUserId = await createTestAuthUser(userId);
  const resolvedAgentId = agentId ?? randomUUID();

  const { data: existingAgent, error: fetchAgentError } = await supabase
    .from('agents')
    .select('id')
    .eq('id', resolvedAgentId)
    .maybeSingle();

  if (fetchAgentError) {
    throw fetchAgentError;
  }

  if (existingAgent) {
    return { userId: resolvedUserId, agentId: resolvedAgentId };
  }

  const { data, error } = await supabase
    .from('agents')
    .insert([
      {
        id: resolvedAgentId,
        user_id: resolvedUserId,
        name: 'Reliability Test Agent',
        description: 'Agent used by reliability tests',
        system_prompt: 'You are a deterministic test agent used only by reliability tests.',
        model: 'gpt-4o-mini'
      }
    ])
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return { userId: resolvedUserId, agentId: data.id };
}
