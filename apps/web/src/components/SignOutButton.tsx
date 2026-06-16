'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseBrowserClient';

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (!error) {
      router.push('/login');
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-500 disabled:opacity-60"
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
