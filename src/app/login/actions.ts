'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { siteUrl } from '@/lib/env';

export interface AuthResult {
  ok: boolean;
  message: string;
}

/** Supabase speaks English; the dashboard speaks Malay. */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Emel atau kata laluan salah.';
  if (m.includes('email not confirmed')) return 'Emel belum disahkan. Semak peti masuk anda.';
  if (m.includes('tiada jemputan')) return message;
  if (m.includes('user already registered')) return 'Emel ini sudah mempunyai akaun. Sila log masuk.';
  if (m.includes('password should be at least')) return 'Kata laluan terlalu pendek (minimum 6 aksara).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Terlalu banyak percubaan. Cuba lagi sebentar.';
  return message;
}

function safeNext(value: unknown): string {
  const next = String(value ?? '/');
  // Only same-origin paths, so a crafted ?next= cannot bounce anyone off-site.
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function signInAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  if (!email || !password) return { ok: false, message: 'Isi emel dan kata laluan.' };

  const supabase = await db();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: translate(error.message) };

  revalidatePath('/', 'layout');
  redirect(next);
}

export async function signUpAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();

  if (!email || !password) return { ok: false, message: 'Isi emel dan kata laluan.' };
  if (password.length < 8) return { ok: false, message: 'Kata laluan mesti sekurang-kurangnya 8 aksara.' };

  const supabase = await db();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || null }, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  // The invite gate lives in a database trigger, so an uninvited email fails
  // here with the trigger's own message rather than silently creating a user.
  if (error) return { ok: false, message: translate(error.message) };

  if (data.session) {
    revalidatePath('/', 'layout');
    redirect('/');
  }

  return {
    ok: true,
    message: 'Akaun dibuat. Semak emel anda untuk pautan pengesahan sebelum log masuk.',
  };
}

/**
 * Google sign-in is started from the server, so the Supabase URL and anon key
 * never reach the browser. Supabase hands back the consent URL and we redirect
 * to it; the callback route below finishes the exchange.
 */
export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await db();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(translate(error?.message ?? 'Google sign-in gagal'))}`);
  }
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await db();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
