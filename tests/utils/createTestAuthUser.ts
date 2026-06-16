import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { randomUUID } from 'crypto';

export async function createTestAuthUser(options?: { userId?: string; email?: string }) {
  const supabase = createServerSupabaseClient();
  const userId = options?.userId ?? randomUUID();
  const email = options?.email ?? `reliability-${userId}@example.com`;

  const existingUser = await findUserByEmail(supabase, email);
  if (existingUser) {
    if (options?.userId && existingUser.id !== options.userId) {
      await deleteExistingUser(supabase, existingUser.id);
      return await createUser(supabase, options.userId, email);
    }

    await ensureProfile(supabase, existingUser.id);
    return existingUser.id;
  }

  return await createUser(supabase, userId, email);
}

async function findUserByEmail(supabase: any, email: string) {
  const { data, error } = await (supabase.auth as any).admin.listUsers({ query: email });
  if (error) {
    throw error;
  }

  const users = data?.users ?? [];
  return users.find((user: any) => user.email === email) ?? null;
}

async function deleteExistingUser(supabase: any, userId: string) {
  const { error } = await (supabase.auth as any).admin.deleteUser(userId);
  if (error) {
    throw error;
  }
}

async function createUser(supabase: any, userId: string, email: string) {
  const password = 'ReliabilityTest!23';
  const { data, error } = await (supabase.auth as any).admin.createUser({
    id: userId,
    email,
    password,
    email_confirm: true,
    user_metadata: { seed: 'reliability-test' }
  });

  if (error) {
    const message = error?.message ?? String(error);
    if (message.includes('already exists') || message.includes('duplicate')) {
      const existingUser = await findUserByEmail(supabase, email);
      if (existingUser) {
        await ensureProfile(supabase, existingUser.id);
        return existingUser.id;
      }
    }
    throw error;
  }

  const createdUserId = data?.user?.id ?? data?.id;
  if (!createdUserId) {
    throw new Error('Unexpected auth user response when creating test user');
  }

  await ensureProfile(supabase, createdUserId);
  return createdUserId;
}

async function ensureProfile(supabase: any, userId: string) {
  const profile = {
    user_id: userId,
    full_name: 'Reliability Test User',
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2'
  };

  const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'user_id' });
  if (error) {
    throw error;
  }
}
