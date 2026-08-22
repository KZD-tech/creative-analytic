'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import {
  deleteConnection, linkCampaign, listCampaignSources, unlinkCampaign,
} from '@/lib/db/connections';
import { syncSource } from '@/lib/connections/sync';
import { getCampaign } from '@/lib/db/queries';
import { importSystemUserConnection } from './api/connect/_import';

export interface ConnectionResult {
  ok: boolean;
  message: string;
  warnings?: string[];
}

export async function syncCampaignAction(
  _prev: ConnectionResult | null,
  formData: FormData,
): Promise<ConnectionResult> {
  await requireUser();
  const campaignId = String(formData.get('campaign_id') ?? '');
  if (!campaignId) return { ok: false, message: 'Kempen tidak dinyatakan.' };

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return { ok: false, message: 'Kempen tidak dijumpai.' };

    const sources = await listCampaignSources(campaignId);
    if (sources.length === 0) {
      return { ok: false, message: 'Belum ada akaun iklan disambungkan ke kempen ini.' };
    }

    const outcomes = await Promise.all(sources.map((source) => syncSource(source)));
    const failed = outcomes.filter((outcome) => !outcome.ok);
    const rows = outcomes.reduce((total, outcome) => total + outcome.rows, 0);
    const warnings = outcomes.flatMap((outcome) => outcome.warnings);

    revalidatePath('/', 'layout');

    // One failing account should not hide what the others managed to pull.
    if (failed.length === outcomes.length) {
      return { ok: false, message: failed.map((f) => f.message).join(' · '), warnings };
    }
    if (failed.length > 0) {
      return {
        ok: true,
        message: `${rows} baris ditarik. ${failed.length} sambungan gagal.`,
        warnings: [...warnings, ...failed.map((f) => f.message)],
      };
    }
    return { ok: true, message: `${rows} baris ditarik daripada ${outcomes.length} akaun.`, warnings };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Penyegerakan gagal.' };
  }
}

export async function linkConnectionAction(
  _prev: ConnectionResult | null,
  formData: FormData,
): Promise<ConnectionResult> {
  await requireUser();
  const campaignId = String(formData.get('campaign_id') ?? '');
  const connectionId = String(formData.get('connection_id') ?? '');
  const raw = String(formData.get('platform_campaign_ids') ?? '').trim();

  if (!campaignId || !connectionId) return { ok: false, message: 'Pilihan tidak lengkap.' };

  const ids = raw
    ? raw.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)
    : [];

  try {
    await linkCampaign({ campaignId, connectionId, platformCampaignIds: ids });
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: ids.length > 0
        ? `Disambungkan, dihadkan kepada ${ids.length} kempen platform.`
        : 'Disambungkan. Seluruh akaun akan ditarik.',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gagal menyambung.' };
  }
}

export async function unlinkConnectionAction(
  _prev: ConnectionResult | null,
  formData: FormData,
): Promise<ConnectionResult> {
  await requireUser();
  const sourceId = String(formData.get('source_id') ?? '');
  if (!sourceId) return { ok: false, message: 'Pilihan tidak lengkap.' };

  try {
    await unlinkCampaign(sourceId);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Sambungan ke kempen ini dibuang. Data yang sudah ditarik kekal.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gagal membuang.' };
  }
}

export async function disconnectAction(
  _prev: ConnectionResult | null,
  formData: FormData,
): Promise<ConnectionResult> {
  await requireUser();
  const connectionId = String(formData.get('connection_id') ?? '');
  if (!connectionId) return { ok: false, message: 'Sambungan tidak dinyatakan.' };

  try {
    await deleteConnection(connectionId);
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: 'Akaun diputuskan dan tokennya dipadam. Data yang sudah ditarik kekal.',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gagal memutuskan.' };
  }
}

/**
 * Imports the ad accounts a system-user token already reaches, skipping OAuth.
 *
 * Only offered when META_SYSTEM_USER_TOKEN is set, which is the deployment
 * saying "this instance belongs to one team that owns these accounts".
 */
export async function importSystemUserAction(
  _prev: ConnectionResult | null,
  formData: FormData,
): Promise<ConnectionResult> {
  const user = await requireUser();
  const campaignId = String(formData.get('campaign_id') ?? '');
  if (!campaignId) return { ok: false, message: 'Kempen tidak dinyatakan.' };

  try {
    const { imported } = await importSystemUserConnection({ userId: user.id, campaignId });
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: imported.length === 1
        ? `${imported[0].name} disambungkan.`
        : `${imported.length} akaun disambungkan: ${imported.map((a) => a.name).join(', ')}.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Import gagal.' };
  }
}
