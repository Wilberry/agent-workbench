'use client';

import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { getBrowserSupabase } from './supabaseBrowserClient';
import type { PropsWithChildren } from 'react';

export default function Providers({ children }: PropsWithChildren) {
  return <SessionContextProvider supabaseClient={getBrowserSupabase()}>{children}</SessionContextProvider>;
}
