import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();

  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId');
  const publicOnly = url.searchParams.get('public') === 'true';

  try {
    let query = supabase.from('tools').select('*').order('created_at', { ascending: false });
    if (orgId) query = query.eq('org_id', orgId);
    if (publicOnly) query = query.eq('public', true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ tools: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();

    const payload = {
      org_id: body.org_id || null,
      name: body.name,
      slug: body.slug,
      description: body.description || null,
      entrypoint: body.entrypoint,
      input_schema: body.input_schema || null,
      output_schema: body.output_schema || null,
      runtime: body.runtime || null,
      public: !!body.public,
      metadata: body.metadata || {},
      created_by: body.created_by || null
    };

    const { data, error } = await supabase.from('tools').insert([payload]).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ tool: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
