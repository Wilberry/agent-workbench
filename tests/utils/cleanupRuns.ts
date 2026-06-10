import { createServerSupabaseClient } from '@agent-workbench/sdk';

export async function cleanupRuns(context: { runId?: string; agentId?: string; conversationId?: string; userId?: string }) {
  const supabase = createServerSupabaseClient();

  if (context.runId) {
    await supabase.from('agent_runs').delete().eq('id', context.runId);
  }
  if (context.agentId) {
    await supabase.from('agent_versions').delete().eq('agent_id', context.agentId);
    await supabase.from('agents').delete().eq('id', context.agentId);
  }
  if (context.conversationId) {
    await supabase.from('conversations').delete().eq('id', context.conversationId);
  }
  if (context.userId) {
    const admin = (supabase.auth as any).admin;
    if (admin?.deleteUser) {
      await admin.deleteUser(context.userId);
    } else {
      await supabase.from('auth.users').delete().eq('id', context.userId);
    }
  }
}
