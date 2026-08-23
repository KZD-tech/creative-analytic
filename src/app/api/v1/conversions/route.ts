import { z } from 'zod';
import { authenticate, authoriseCampaign, requireScope } from '@/lib/api/auth';
import { adminDb } from '@/lib/db/client';
import { writeConversions } from '@/lib/db/ingest';
import type { NormalizedConversion } from '@/lib/ingest/adapter';
import { fail, ok, readBody } from '../_respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Agents batch; a cap keeps one request from becoming a timeout. */
const MAX_ROWS = 1000;

const Donation = z.object({
  /**
   * The receipt number from Onpay. Optional, but supplying it is what makes a
   * re-send idempotent — without it, dedupe falls back to a digest of the row's
   * own content, and a corrected amount reads as a second donation.
   */
  external_id: z.string().trim().min(1).max(200).nullish(),
  occurred_at: z.string().datetime({ offset: true }),
  amount: z.number().finite().nonnegative(),
  channel: z.string().trim().max(200).nullish(),
  /** What the agent matched on, kept for auditing its decision. */
  attribution_raw: z.string().trim().max(500).nullish(),
  /** The agent's match. Either name is accepted; the exact ad name matches best. */
  ad_name: z.string().trim().max(300).nullish(),
});

const Payload = z.object({
  campaign_id: z.string().trim().min(1).optional(),
  donations: z.array(Donation).min(1).max(MAX_ROWS),
});

/**
 * Accepts donations an agent has already pulled from Onpay and matched to ads.
 *
 * Written under source 'api', which keeps these rows out of the snapshot a CSV
 * upload takes — otherwise rolling back a spreadsheet would delete the agent's
 * work along with it.
 */
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const scope = requireScope(auth.caller, 'write');
  if (!scope.ok) return fail(scope.status, scope.error);

  const raw = await readBody(request);
  if (!raw.ok) return fail(400, 'Badan permintaan bukan JSON yang sah.');

  const parsed = Payload.safeParse(raw.body);
  if (!parsed.success) {
    return fail(422, 'Data tidak menepati bentuk yang dijangka.', {
      issues: parsed.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const campaignId = parsed.data.campaign_id ?? auth.caller.campaignId;
  if (!campaignId) {
    return fail(400, 'Nyatakan campaign_id. Kunci ini tidak terhad kepada satu kempen.');
  }

  const allowed = await authoriseCampaign(auth.caller, campaignId);
  if (!allowed.ok) return fail(allowed.status, allowed.error);

  const items: NormalizedConversion[] = parsed.data.donations.map((d) => ({
    external_id: d.external_id ?? null,
    occurred_at: d.occurred_at,
    amount: d.amount,
    channel: d.channel ?? null,
    attribution_raw: d.attribution_raw ?? null,
    ad_name_hint: d.ad_name ?? null,
  }));

  try {
    const outcome = await writeConversions(campaignId, items, {
      filename: null,
      skipped: 0,
      warnings: [],
      source: 'api',
      admin: true,
    });

    return ok({
      campaign_id: campaignId,
      received: items.length,
      inserted: outcome.inserted,
      updated: outcome.updated,
      skipped: outcome.skipped,
      warnings: outcome.warnings,
      batch_id: outcome.batchId,
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Gagal menyimpan derma.');
  }
}

// ── corrections ─────────────────────────────────────────────────────────────

const MAX_DELETE = 1000;

const DeletePayload = z
  .object({
    campaign_id: z.string().trim().min(1).optional(),
    /** The precise form: remove these receipts and nothing else. */
    external_ids: z.array(z.string().trim().min(1)).min(1).max(MAX_DELETE).optional(),
    /** The blunt form: remove everything the agent wrote in this window. */
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    /** Required for the date form. Naming ids is its own confirmation. */
    confirm: z.literal(true).optional(),
  })
  .refine((v) => Boolean(v.external_ids) !== Boolean(v.from || v.to), {
    message: 'Nyatakan external_ids ATAU julat tarikh (from/to), bukan kedua-duanya.',
  });

/**
 * Removes donations the agent sent, so a bad run can be corrected rather than
 * lived with.
 *
 * Three limits make this safe to hand to a machine:
 *
 * Only rows written through this API are touched. A CSV upload is somebody's
 * deliberate work; an agent must not be able to erase it by getting a date
 * range wrong.
 *
 * Deleting by date needs `confirm: true`. Naming receipts is already a
 * statement of intent — naming a month is not, and a wrong month is the
 * mistake worth making expensive.
 *
 * The count comes back, so the caller can check the damage matches what it
 * meant to undo.
 */
export async function DELETE(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const scope = requireScope(auth.caller, 'write');
  if (!scope.ok) return fail(scope.status, scope.error);

  const raw = await readBody(request);
  if (!raw.ok) return fail(400, 'Badan permintaan bukan JSON yang sah.');

  const parsed = DeletePayload.safeParse(raw.body);
  if (!parsed.success) {
    return fail(422, 'Permintaan padam tidak menepati bentuk yang dijangka.', {
      issues: parsed.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { external_ids: ids, from, to, confirm } = parsed.data;
  const campaignId = parsed.data.campaign_id ?? auth.caller.campaignId;
  if (!campaignId) {
    return fail(400, 'Nyatakan campaign_id. Kunci ini tidak terhad kepada satu kempen.');
  }

  const allowed = await authoriseCampaign(auth.caller, campaignId);
  if (!allowed.ok) return fail(allowed.status, allowed.error);

  if (!ids) {
    if (!from || !to) return fail(422, 'Julat memerlukan kedua-dua from dan to.');
    if (from > to) return fail(422, 'from mesti sebelum atau sama dengan to.');
    if (!confirm) {
      return fail(422, 'Padam mengikut julat memerlukan "confirm": true.');
    }
  }

  const supabase = adminDb();
  let query = supabase
    .from('conversions')
    .delete()
    .eq('campaign_id', campaignId)
    // Never CSV. An agent correcting itself must not be able to erase a
    // spreadsheet somebody uploaded by hand.
    .eq('source', 'api');

  if (ids) {
    query = query.in('external_id', ids);
  } else {
    query = query
      .gte('occurred_at', `${from}T00:00:00Z`)
      .lt('occurred_at', `${addDay(to as string)}T00:00:00Z`);
  }

  const { data, error } = await query.select('id');
  if (error) return fail(500, error.message);

  return ok({
    campaign_id: campaignId,
    deleted: (data ?? []).length,
    matched_by: ids ? 'external_ids' : 'date_range',
  });
}

/** The `to` day is inclusive, so the exclusive bound is the day after it. */
function addDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
