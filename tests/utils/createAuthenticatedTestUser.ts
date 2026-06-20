import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { randomUUID } from 'crypto';

export async function createAuthenticatedTestUser(options?: { email?: string }) {
  const supabase = createServerSupabaseClient();
  const userId = randomUUID();
  const email = options?.email ?? `auth-test-${userId}@example.com`;
  const password = 'Test1234!@';

  // Create user
  const { data: userData, error: createError } = await (supabase.auth as any).admin.createUser({
    id: userId,
    email,
    password,
    email_confirm: true,
    user_metadata: { test: true }
  });

  if (createError || !userData?.user) {
    throw createError ?? new Error('Failed to create test user');
  }

  // Create a client-side Supabase instance to sign in
  const { createClient } = await import('@supabase/supabase-js');
  const clientSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mamd0bHltcGVkemdtYWVuaXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MzkyNTc4MTAsImV4cCI6MTk1NDgzNzgxMH0.Z3-aq-VVhW-7XY0dJ5V5X5X5X5X5X5X5X5X5X5X5X'
  );

  // Sign in to get a session
  const { data: signInData, error: signInError } = await clientSupabase.auth.signInWithPassword({
    email,
    password
  });

  if (signInError || !signInData?.session) {
    throw signInError ?? new Error('Failed to sign in test user');
  }

  return {
    userId: userData.user.id,
    email,
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token
  };
}
