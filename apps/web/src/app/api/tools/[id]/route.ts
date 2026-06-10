import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@agent-workbench/sdk';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { id } = params;

  const { data, error } = await supabase.from('tools').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ tool: data });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { id } = params;

  try {
    const body = await req.json();
    const updates = {
      name: body.name,
      slug: body.slug,
      description: body.description || null,
      entrypoint: body.entrypoint,
      input_schema: body.input_schema || null,
      output_schema: body.output_schema || null,
      runtime: body.runtime || null,
      public: typeof body.public === 'boolean' ? body.public : undefined,
      metadata: body.metadata || undefined
    };

    const { data, error } = await supabase.from('tools').update(updates).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tool: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { id } = params;

  const { error } = await supabase.from('tools').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
