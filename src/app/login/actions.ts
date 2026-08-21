'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, safeEqual, sessionToken } from '@/lib/auth';
import { APP_PASSWORD, APP_SESSION_SECRET } from '@/lib/env';

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const submitted = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/') || '/';

  if (!APP_PASSWORD) redirect('/');
  if (!safeEqual(submitted, APP_PASSWORD)) return 'Kata laluan salah.';

  const store = await cookies();
  store.set(SESSION_COOKIE, await sessionToken(APP_PASSWORD, APP_SESSION_SECRET), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  // Only same-origin paths, so a crafted ?next= cannot bounce anyone off-site.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
