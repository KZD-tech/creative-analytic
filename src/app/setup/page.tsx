import { readSupabaseEnv } from '@/lib/env';
import { SupabaseNotConfiguredError } from '@/lib/db/client';
import { SetupNotice } from '@/components/SetupNotice';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Where the proxy sends every request while Supabase config is incomplete.
 * Having a real route for it means the explanation survives the auth layer —
 * previously `requireUser()` threw first and the reader got a generic crash.
 */
export default function SetupPage() {
  const env = readSupabaseEnv();
  if (env.ok) redirect('/');

  return <SetupNotice error={new SupabaseNotConfiguredError(env.missing)} />;
}
