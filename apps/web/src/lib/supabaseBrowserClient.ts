'use client';

import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let supabase: SupabaseClient<Database> | null = null;

export function getBrowserSupabase() {
  if (!supabase) {
    supabase = createBrowserSupabaseClient<Database>();
  }
  return supabase;
}
