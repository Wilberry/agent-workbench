import { createServerSupabaseClient } from '@agent-workbench/sdk';
export async function persistTraceEvent(runId, eventType, payload = {}) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('agent_run_events').insert([
        {
            run_id: runId,
            event_type: eventType,
            payload
        }
    ]);
    if (error) {
        console.warn('Failed to persist agent run event', { runId, eventType, error });
    }
}
export async function getRunTraceEvents(runId) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from('agent_run_events')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });
    if (error) {
        throw error;
    }
    return data;
}
