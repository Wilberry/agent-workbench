import { getOperationalReadiness } from '../../../../lib/operationalHealth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = await getOperationalReadiness();

  return new Response(JSON.stringify(readiness), {
    status: readiness.status === 'ready' ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
