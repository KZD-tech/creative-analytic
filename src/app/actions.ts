'use server';

import { revalidatePath } from 'next/cache';
import { parseFbAdsCsv } from '@/lib/ingest/fbAds';
import { parseConversionsCsv } from '@/lib/ingest/conversions';
import { parseMediaLinksCsv } from '@/lib/ingest/mediaLinks';
import {
  rematchConversions,
  rollbackBatch,
  writeAdMetrics,
  writeConversions,
  writeMediaLinks,
  type WriteOutcome,
} from '@/lib/db/ingest';
import { requireUser } from '@/lib/auth/session';
import {
  addTagToCreatives,
  createCampaign,
  getCampaign,
  saveBenchmarks,
  setCreativeTags,
  updateCampaign,
  upsertTag,
} from '@/lib/db/queries';
import type { TagDimension } from '@/types/db';

export interface ActionResult {
  ok: boolean;
  message: string;
  warnings?: string[];
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function fail(error: unknown): ActionResult {
  return { ok: false, message: error instanceof Error ? error.message : 'Ralat tidak diketahui' };
}

// ── campaigns ───────────────────────────────────────────────────────────────

export async function createCampaignAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const currency = String(formData.get('currency') ?? 'MYR').trim() || 'MYR';
  const timezone = String(formData.get('timezone') ?? 'Asia/Kuala_Lumpur').trim();

  if (!name) return { ok: false, message: 'Nama kempen wajib diisi.' };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    return { ok: false, message: 'ID kempen hanya boleh mengandungi huruf kecil, nombor dan tanda "-".' };
  }

  try {
    const user = await requireUser();
    const campaign = await createCampaign({ id, name, ownerId: user.id, currency, timezone });
    revalidatePath('/', 'layout');
    return { ok: true, message: `Kempen "${campaign.name}" berjaya dibuat.` };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCampaignAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const currency = String(formData.get('currency') ?? '').trim() || 'MYR';
  const timezone = String(formData.get('timezone') ?? '').trim() || 'Asia/Kuala_Lumpur';

  if (!id) return { ok: false, message: 'Ruang kerja tidak dinyatakan.' };
  if (!name) return { ok: false, message: 'Nama wajib diisi.' };

  try {
    await requireUser();
    const campaign = await updateCampaign({ id, name, currency, timezone });
    revalidatePath('/', 'layout');
    return { ok: true, message: `Disimpan sebagai "${campaign.name}".` };
  } catch (error) {
    return fail(error);
  }
}

// ── uploads ─────────────────────────────────────────────────────────────────

export async function uploadCsvAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const campaignId = String(formData.get('campaign_id') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const file = formData.get('file');

  if (!campaignId) return { ok: false, message: 'Kempen tidak dinyatakan.' };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Sila pilih fail CSV.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `Fail terlalu besar (maksimum ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
  }

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return { ok: false, message: 'Kempen tidak dijumpai.' };

    const text = await file.text();
    let outcome: WriteOutcome;

    if (kind === 'fb_ads') {
      const parsed = parseFbAdsCsv(text);
      if (parsed.items.length === 0) {
        return { ok: false, message: 'Tiada baris yang boleh dibaca.', warnings: parsed.warnings };
      }
      outcome = await writeAdMetrics(campaignId, parsed.items, {
        source: 'csv',
        filename: file.name,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
      });
      // Donations uploaded before their ad existed can be joined up now.
      const rematched = await rematchConversions(campaignId);
      if (rematched > 0) outcome.warnings.push(`${rematched} derma lama berjaya dipadankan semula.`);
    } else if (kind === 'conversions') {
      const parsed = parseConversionsCsv(text, campaign.timezone);
      if (parsed.items.length === 0) {
        return { ok: false, message: 'Tiada baris yang boleh dibaca.', warnings: parsed.warnings };
      }
      outcome = await writeConversions(campaignId, parsed.items, {
        filename: file.name,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
      });
    } else if (kind === 'media_links') {
      const parsed = parseMediaLinksCsv(text);
      if (parsed.items.length === 0) {
        return { ok: false, message: 'Tiada baris yang boleh dibaca.', warnings: parsed.warnings };
      }
      outcome = await writeMediaLinks(campaignId, parsed.items, {
        filename: file.name,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
      });
    } else {
      return { ok: false, message: `Jenis muat naik tidak dikenali: ${kind}` };
    }

    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: `${outcome.inserted} baris baru, ${outcome.updated} dikemas kini, ${outcome.skipped} dilangkau.`,
      warnings: outcome.warnings,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function rollbackAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const campaignId = String(formData.get('campaign_id') ?? '');
  const batchId = String(formData.get('batch_id') ?? '');
  if (!campaignId || !batchId) return { ok: false, message: 'Permintaan rollback tidak lengkap.' };

  try {
    const restored = await rollbackBatch(campaignId, batchId);
    revalidatePath('/', 'layout');
    return { ok: true, message: `${restored} rekod dipulihkan.` };
  } catch (error) {
    return fail(error);
  }
}

// ── tagging ─────────────────────────────────────────────────────────────────

export async function setCreativeTagsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const creativeId = String(formData.get('creative_id') ?? '');
  const tagIds = formData.getAll('tag_id').map(String).filter(Boolean);
  if (!creativeId) return { ok: false, message: 'Kreatif tidak dinyatakan.' };

  try {
    await setCreativeTags(creativeId, tagIds);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Tag dikemas kini.' };
  } catch (error) {
    return fail(error);
  }
}

export async function bulkTagAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const campaignId = String(formData.get('campaign_id') ?? '');
  const dimension = String(formData.get('dimension') ?? 'custom') as TagDimension;
  const label = String(formData.get('label') ?? '').trim();
  const creativeIds = formData.getAll('creative_id').map(String).filter(Boolean);

  if (!campaignId || !label) return { ok: false, message: 'Nama tag wajib diisi.' };
  if (creativeIds.length === 0) return { ok: false, message: 'Pilih sekurang-kurangnya satu kreatif.' };

  try {
    const tag = await upsertTag(campaignId, dimension, label);
    await addTagToCreatives(tag.id, creativeIds);
    revalidatePath('/', 'layout');
    return { ok: true, message: `Tag "${tag.label}" ditambah pada ${creativeIds.length} kreatif.` };
  } catch (error) {
    return fail(error);
  }
}

// ── benchmarks ──────────────────────────────────────────────────────────────

export async function saveBenchmarksAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const campaignId = String(formData.get('campaign_id') ?? '');
  if (!campaignId) return { ok: false, message: 'Kempen tidak dinyatakan.' };

  const numeric = (key: string) => {
    const raw = formData.get(key);
    if (raw === null || String(raw).trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const patch = Object.fromEntries(
    (
      [
        'hook_rate_good',
        'hook_rate_ok',
        'hold_rate_good',
        'hold_rate_ok',
        'ctr_good',
        'ctr_ok',
        'lpv_rate_good',
        'lpv_rate_ok',
        'cvr_good',
        'cvr_ok',
        'roas_good',
        'roas_ok',
        'min_spend',
      ] as const
    )
      .map((key) => [key, numeric(key)] as const)
      .filter(([, value]) => value !== undefined),
  );

  try {
    await saveBenchmarks(campaignId, patch);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Benchmark disimpan.' };
  } catch (error) {
    return fail(error);
  }
}
