import { z } from 'zod';
import { authenticate, authoriseCampaign, requireScope } from '@/lib/api/auth';
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
