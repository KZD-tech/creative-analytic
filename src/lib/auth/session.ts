import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
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

  // The proxy middleware already called getUser() — which revalidates the
  // token with Supabase rather than trusting the cookie's contents — for
  // every request that reaches here, and relays the result via headers. Using
  // that instead of calling getUser() a second time saves a full round trip
  // to Supabase Auth on every navigation. Falling back to a real getUser()
  // call keeps this correct for anything the middleware didn't see (route
  // handlers it excludes, tests, local scripts).
  const headerList = await headers();
  const relayedId = headerList.get('x-user-id');
  const relayedEmail = headerList.get('x-user-email');

  let id: string;
  let email: string;

  if (relayedId) {
    id = relayedId;
    email = relayedEmail ?? '';
  } else {
    const { data, error } = await supabase.auth.getUser().catch(() => ({
      data: { user: null },
      error: new Error('unreachable'),
    }));
    if (error || !data.user) return null;
    id = data.user.id;
    email = data.user.email ?? '';
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', id)
    .maybeSingle();

  return {
    id,
    email,
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
