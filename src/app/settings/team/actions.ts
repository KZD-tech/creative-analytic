'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/session';

export interface InviteResult {
  ok: boolean;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function inviteAction(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  await requireAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? 'member');

  if (!EMAIL.test(email)) return { ok: false, message: 'Alamat emel tidak sah.' };
  if (role !== 'admin' && role !== 'member') return { ok: false, message: 'Peranan tidak dikenali.' };

  const supabase = await db();
  const { error } = await supabase
    .from('invites')
    .upsert({ email, role }, { onConflict: 'email' });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/settings/team');
  return {
    ok: true,
    message: `${email} dijemput. Minta mereka daftar di halaman log masuk dengan emel itu.`,
  };
}

export async function revokeInviteAction(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  await requireAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const supabase = await db();

  // Revoking only removes the invitation. An account that already accepted it
  // keeps working — removing access is a separate, deliberate action.
  const { error } = await supabase.from('invites').delete().eq('email', email).is('accepted_at', null);
  if (error) return { ok: false, message: error.message };

  revalidatePath('/settings/team');
  return { ok: true, message: `Jemputan untuk ${email} dibatalkan.` };
}
