import 'dotenv/config';

// Ensure required environment variables are available for E2E verification.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Environment variables NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set for runtime tests');
}
