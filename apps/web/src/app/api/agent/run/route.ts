import { NextRequest } from 'next/server';
import { handleAgentRun } from './handler';

export async function POST(request: NextRequest, authClient?: Parameters<typeof handleAgentRun>[1]) {
  return handleAgentRun(request, authClient);
}
