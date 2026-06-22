import { NextRequest } from 'next/server';
import { createServerSupabaseClient, evaluations } from '@agent-workbench/sdk';

export async function GET(_request: NextRequest, { params }: { params: { datasetId: string } }) {
  try {
    const supabase = createServerSupabaseClient();
    const authRes = await supabase.auth.getUser();
    const user = authRes?.data?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

    const dataset = await evaluations.getDataset(params.datasetId, supabase);
    return new Response(JSON.stringify({ dataset }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}
