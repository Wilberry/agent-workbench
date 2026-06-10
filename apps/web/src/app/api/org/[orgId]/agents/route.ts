import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

export async function GET(_req: Request, { params }: { params: { orgId: string } }) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('organization_id', params.orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

export async function POST(req: Request, { params }: { params: { orgId: string } }) {
  const supabase = createServerSupabaseClient();
  const payload = await req.json();

  const { data, error } = await supabase
    .from('agents')
    .insert([
      {
        user_id: payload.user_id,
        organization_id: params.orgId,
        name: payload.name,
        description: payload.description,
        system_prompt: payload.system_prompt,
        model: payload.model ?? 'gpt-4o-mini'
      }
    ])
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}
