import 'dotenv/config';
import { vi } from 'vitest';

// Allow tests to run with a local in-memory Supabase mock when USE_MOCK_SUPABASE=true
const useMock = process.env.USE_MOCK_SUPABASE === 'true';

vi.mock('@agent-workbench/sdk', async () => {
  const actual = await vi.importActual<typeof import('@agent-workbench/sdk')>('@agent-workbench/sdk');
  if (useMock) {
    // provide a dummy OPENAI key when mocking
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-openai-key';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('./mocks/mockSupabase.cjs');
    return {
      ...actual,
      createServerSupabaseClient: () => m.createMockSupabaseClient()
    };
  }
  return actual;
});

if (!useMock) {
  // Ensure required environment variables are available for E2E verification.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Environment variables NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY must be set for runtime tests');
  }
}
