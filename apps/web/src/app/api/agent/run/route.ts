import { NextRequest } from 'next/server';
import { handleAgentRun } from './handler';

export async function POST(request: NextRequest) {
  return handleAgentRun(request);
}
