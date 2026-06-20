import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const agents = await db.marketplace.listPublicAgentVersions(100);
  return NextResponse.json({ agents });
}
