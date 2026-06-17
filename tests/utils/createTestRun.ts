import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { randomUUID } from 'crypto';

export type TestRunContext = {
  userId: string;
  agentId: string;
  conversationId: string;
  versionId: string;
  runId: string;
};

export async function createTestRun(): Promise<TestRunContext> {
  const supabase = createServerSupabaseClient();
  const userId = randomUUID();
  const email = `e2e-${userId}@example.com`;
  const password = `Test1234!`;

  const admin = (supabase.auth as any).admin;
  const { data: userData, error: userError } = await admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test: true }
  });

  console.log('DEBUG createTestRun createUser response', {
    userData,
    userError
  });

  if (userError || !userData || !userData.user) {
    throw userError ?? new Error('Failed to create test auth user');
  }

  const user = userData.user;

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert([
      {
        user_id: user.id,
        name: 'E2E test agent',
        description: 'Agent used by E2E verification tests',
        system_prompt: 'You are a deterministic test agent. Keep responses concise.',
        model: 'gpt-4o-mini'
      }
    ])
    .select('id')
    .single();

  if (agentError || !agent) {
    throw agentError ?? new Error('Failed to create test agent');
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .insert([
      {
        agent_id: agent.id,
        user_id: user.id,
        title: 'E2E verification conversation'
      }
    ])
    .select('id')
    .single();

  if (conversationError || !conversation) {
    throw conversationError ?? new Error('Failed to create test conversation');
  }

  const { data: version, error: versionError } = await supabase
    .from('agent_versions')
    .insert([
      {
        agent_id: agent.id,
        version: 'e2e-v1',
        description: 'Test version for deterministic replay and realtime verification',
        system_prompt: 'Run the provided workflow exactly and keep the output short.',
        workflow: ['Planner', 'Executor', 'Reviewer'],
        metadata: { model: 'gpt-4o-mini' }
      }
    ])
    .select('id')
    .single();

  if (versionError || !version) {
    throw versionError ?? new Error('Failed to create test agent version');
  }

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert([
      {
        user_id: user.id,
        conversation_id: conversation.id,
        workflow: ['Planner', 'Executor', 'Reviewer'],
        status: 'pending'
      }
    ])
    .select('id')
    .single();

  if (runError || !run) {
    throw runError ?? new Error('Failed to create test agent run');
  }

  return {
    userId: user.id,
    agentId: agent.id,
    conversationId: conversation.id,
    versionId: version.id,
    runId: run.id
  };
}
