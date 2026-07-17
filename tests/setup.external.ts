const SUPABASE_MOCK_FLAG = 'USE_MOCK_SUPABASE';

interface ExternalTestEnvironmentOptions {
  suiteName: string;
  requiredSupabaseVariables: string[];
  requireOpenAI?: boolean;
}

export function requireExternalTestEnvironment({
  suiteName,
  requiredSupabaseVariables,
  requireOpenAI = false,
}: ExternalTestEnvironmentOptions): void {
  if (process.env[SUPABASE_MOCK_FLAG] === 'true') {
    throw new Error(
      `${suiteName} suite requires a real Supabase environment; ${SUPABASE_MOCK_FLAG}=true is not supported.`,
    );
  }

  const missing = requiredSupabaseVariables.filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    throw new Error(
      `${suiteName} suite configuration is incomplete. Missing: ${missing.join(', ')}. ` +
        'Export these variables or load them from the root .env before running this suite.',
    );
  }

  const useMockOpenAI = process.env.USE_MOCK_OPENAI === 'true';
  if (requireOpenAI && !useMockOpenAI && !process.env.OPENAI_API_KEY) {
    throw new Error(
      `${suiteName} requires OPENAI_API_KEY unless USE_MOCK_OPENAI=true is explicitly set.`,
    );
  }
}
