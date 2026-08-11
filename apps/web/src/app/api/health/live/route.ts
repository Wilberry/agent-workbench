export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'agent-workbench-web'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }
  );
}
