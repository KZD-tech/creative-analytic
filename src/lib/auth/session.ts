import 'server-only';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: 'admin' | 'member';
}

/** The signed-in user, or null. Never throws on a missing session. */
export async function currentUser(): Promise<SessionUser | null> {
  // "Not signed in" and "cannot reach Supabase" both mean the same thing to a
  // caller: do not serve this page. Throwing here instead would surface as an
  // opaque error code in production rather than the login or setup screen.
  let supabase;
  try {
    supabase = await db();
  } catch {
    return null;
  }

  // getUser() revalidates the token with Supabase rather than trusting the
  // cookie's contents, which is the difference that matters on a server that
  // makes authorization decisions.
  const { data, error } = await supabase.auth.getUser().catch(() => ({
    data: { user: null },
    error: new Error('unreachable'),
  }));
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    fullName: (profile?.full_name as string | null) ?? null,
    role: (profile?.role as 'admin' | 'member') ?? 'member',
  };
}

/** For pages and actions that make no sense without an account. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/');
  return user;
}
