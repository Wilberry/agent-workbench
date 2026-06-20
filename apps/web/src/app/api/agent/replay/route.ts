import { NextRequest } from 'next/server';
import { createServerSupabaseClient, agentRuns } from '@agent-workbench/sdk';

type ReplayBody = {
  originalRunId: string;
  versionId?: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReplayBody;
    const { originalRunId, versionId, reason } = body;

    if (!originalRunId) {
      return new Response(
        JSON.stringify({ error: 'originalRunId is required' }),
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const authRes = await supabase.auth.getUser();
    const user = authRes?.data?.user ?? null;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    // Get original run
    let originalRun;
    try {
      originalRun = await agentRuns.get(originalRunId);
    } catch (err) {
      // Map known not-found errors to 400/404
      const msg = String((err as any)?.message ?? err ?? '');
      if (msg.toLowerCase().includes('not found')) {
        return new Response(JSON.stringify({ error: 'Original run not found' }), { status: 400 });
      }
      console.error('Error fetching original run for replay:', err);
      return new Response(JSON.stringify({ error: 'Failed to fetch original run' }), { status: 500 });
    }

    // Verify user owns the original run
    if ((originalRun as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 });
    }

    // Create replay run
    const replayRun = await agentRuns.replayRun(originalRunId, {
      versionId,
      reason: reason ?? 'Manual replay from UI'
    });

    return new Response(
      JSON.stringify({
        replayRunId: replayRun.id,
        status: 'created',
        message: 'Replay run created'
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Replay error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500 }
    );
  }
}
