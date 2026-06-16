import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('agent_versions')
    .select('*, agents(id, name, description)')
    .filter("metadata->>public", 'eq', 'true')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}
