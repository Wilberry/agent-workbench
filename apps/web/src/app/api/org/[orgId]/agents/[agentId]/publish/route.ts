import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

export async function PATCH(req: Request, { params }: { params: { orgId: string; agentId: string } }) {
  const supabase = createServerSupabaseClient();
  const payload = await req.json();

  const { data, error } = await supabase
    .from('marketplace_agents')
    .update({ visibility: payload.visibility })
    .eq('id', params.agentId)
    .eq('org_id', params.orgId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}
