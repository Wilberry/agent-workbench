import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const createBrowserSupabaseClient = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey);

export const createServerSupabaseClient = () => {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be defined in the server environment');
  }
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
};
