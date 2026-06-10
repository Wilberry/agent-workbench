import { createBrowserSupabaseClient } from './supabaseClient';
import type { AgentRun } from './types';

export type RunUpdateCallback = (run: AgentRun) => void;

export function subscribeToRun(runId: string, onUpdate: RunUpdateCallback): () => void {
  const supabase = createBrowserSupabaseClient();

  const channel = supabase
    .channel(`agent_runs:${runId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'agent_runs',
        filter: `id=eq.${runId}`
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as AgentRun);
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    channel.unsubscribe();
  };
}

export function subscribeToConversationRuns(
  conversationId: string,
  onUpdate: (run: AgentRun) => void
): () => void {
  const supabase = createBrowserSupabaseClient();

  const channel = supabase
    .channel(`runs:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'agent_runs',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as AgentRun);
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

export type RunEvent = { event: string; payload: any };
export type RunEventCallback = (event: RunEvent) => void;

export function subscribeToRunEvents(runId: string, onEvent: RunEventCallback): () => void {
  const supabase = createBrowserSupabaseClient();

  const channel = supabase.channel(`run:${runId}`).on('broadcast', { event: '*' }, (payload) => {
    try {
      // payload has { event, payload }
      // Normalize to { event, payload }
      const evt = payload as any;
      const eventName = evt.event ?? evt.type ?? 'message';
      const data = evt.payload ?? evt;
      onEvent({ event: eventName, payload: data });
    } catch (err) {
      // ignore
    }
  }).subscribe();

  return () => {
    channel.unsubscribe();
  };
}
