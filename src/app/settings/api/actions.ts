'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createApiKey, revokeApiKey } from '@/lib/db/apiKeys';

export interface KeyResult {
  ok: boolean;
  message: string;
  /** Present exactly once, on creation. */
  key?: string;
}

export async function createKeyAction(
  _prev: KeyResult | null,
  formData: FormData,
): Promise<KeyResult> {
  try {
    const user = await requireUser();
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return { ok: false, message: 'Beri nama kepada kunci ini.' };

    const campaignId = String(formData.get('campaign_id') ?? '').trim() || null;
    const scopes = formData.getAll('scopes').map(String).filter((s) => s === 'read' || s === 'write');
    if (scopes.length === 0) return { ok: false, message: 'Pilih sekurang-kurangnya satu kebenaran.' };

    const { key } = await createApiKey({ ownerId: user.id, name, campaignId, scopes });
    revalidatePath('/settings/api');

    return { ok: true, key, message: 'Kunci dicipta. Salin sekarang — ia tidak boleh dilihat lagi.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gagal mencipta kunci.' };
  }
}

export async function revokeKeyAction(
  _prev: KeyResult | null,
  formData: FormData,
): Promise<KeyResult> {
  try {
    await requireUser();
    const keyId = String(formData.get('key_id') ?? '');
    if (!keyId) return { ok: false, message: 'Kunci tidak dinyatakan.' };

    await revokeApiKey(keyId);
    revalidatePath('/settings/api');
    return { ok: true, message: 'Kunci dibatalkan. Permintaan dengannya akan ditolak serta-merta.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gagal membatalkan.' };
  }
}
