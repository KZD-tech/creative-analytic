import 'server-only';
import { fetchMetaCreatives, fetchMetaInsights } from './meta';
import { fetchGoogleAdsCreatives, fetchGoogleAdsInsights, refreshGoogleToken } from './googleAds';
import { fetchOnpaySalesPage, mapOnpaySale } from './onpay';
import { googleAdsConfig, onpayConfig } from './config';
import { needsReauth } from './http';
import { extendCover, pendingWindows, type Window } from './windows';
import {
  readConnectionSecrets, recordCover, recordSync, updateAccessToken, type AdConnection,
  type CampaignSource,
} from '@/lib/db/connections';
import { applyCreativeAssets, writeAdMetrics, writeOnpayConversions } from '@/lib/db/ingest';
import type { IngestResult, NormalizedAdMetric } from '@/lib/ingest/adapter';

export interface SyncOutcome {
  ok: boolean;
  message: string;
  warnings: string[];
  rows: number;
  /** True when the budget ran out with windows still pending. */
  more: boolean;
}

/**
 * How long one sync may spend before stopping and saving what it has.
 *
 * Comfortably inside the request limit. Stopping early is not a failure here:
 * the covered range is recorded after every window, so the next run continues
 * rather than starting over.
 */
const BUDGET_MS = 45_000;

/**
 * Held back from the metrics pull for the creative assets.
 *
 * Without a reserve, the asset call started only once the budget was already
 * spent, and a single Graph request can take twenty seconds — enough to push
 * the whole function past its limit. A timeout there is worse than a slow sync,
 * because the platform returns a gateway error page instead of a response, and
 * the numbers already written go unreported.
 */
const CREATIVE_RESERVE_MS = 16_000;

/**
 * How far back a sync tries to reach.
 *
 * This is a target, not a per-request workload: the window is pulled in weekly
 * chunks, newest first, and each run stops on its time budget with the covered
 * range recorded. A long lookback therefore costs several runs, not one long
 * one — and once the history is in, the daily overlap is all that moves.
 *
 * Meta keeps insights for 37 months, so the ceiling here is ours, not theirs.
 */
export const DEFAULT_LOOKBACK_DAYS = Number(process.env.META_LOOKBACK_DAYS) || 180;

function windowFor(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

/**
 * `admin` is for a caller with no user session of its own — the scheduled
 * cron sync, running as the service role. The button-triggered sync leaves
 * it false and keeps going through the signed-in user's own session and RLS,
 * unchanged from before.
 */
export async function syncSource(
  source: CampaignSource,
  days = DEFAULT_LOOKBACK_DAYS,
  admin = false,
): Promise<SyncOutcome> {
  const target = windowFor(days);
  const platform = source.connection.platform;
  const started = Date.now();
  const metricsDeadline = started + BUDGET_MS - CREATIVE_RESERVE_MS;
  const overallDeadline = started + BUDGET_MS;

  let cover: { from: string | null; through: string | null } = {
    from: source.connection.synced_from,
    through: source.connection.synced_through,
  };
  const windows = pendingWindows(target, cover);

  if (windows.length === 0) {
    await recordSync(source.connection_id, { rows: 0 }, admin);
    return { ok: true, message: 'Sudah terkini.', warnings: [], rows: 0, more: false };
  }

  let rows = 0;
  let done = 0;
  const warnings: string[] = [];

  try {
    const secrets = await readConnectionSecrets(source.connection_id, admin);
    let accessToken = secrets.accessToken;

    // Google access tokens last an hour, so a scheduled sync is almost always
    // running with an expired one. Refresh once, before any window.
    if (platform === 'google_ads' && secrets.refreshToken) {
      const config = googleAdsConfig();
      const refreshed = await refreshGoogleToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: secrets.refreshToken,
      });
      accessToken = refreshed.accessToken;
      await updateAccessToken(source.connection_id, accessToken, refreshed.expiresAt, admin);
    }

    for (const window of windows) {
      const result = await fetchWindow(source, accessToken, window);
      warnings.push(...result.warnings);

      if (result.items.length > 0) {
        const outcome = await writeAdMetrics(source.campaign_id, result.items, {
          source: platform === 'meta' ? 'meta_api' : 'google_ads',
          filename: null,
          skipped: result.skipped,
          warnings: result.warnings,
          admin,
        });
        rows += outcome.inserted + outcome.updated;
        warnings.push(...outcome.warnings);
      }

      // Saved per window, so an interrupted run still moves the cursor.
      const extended = extendCover(cover, window);
      await recordCover(source.connection_id, extended, admin);
      cover = extended;
      done += 1;

      if (Date.now() >= metricsDeadline) break;
    }

    // Once per run, not once per window: creative assets do not change by the
    // day, and the numbers are the part worth spending the budget on.
    if (rows > 0 && Date.now() < overallDeadline) {
      try {
        let assets;
        if (platform === 'meta') {
          assets = await fetchMetaCreatives({
            accessToken,
            accountId: source.connection.external_account_id,
            campaignIds: source.platform_campaign_ids,
            deadline: overallDeadline,
          });
        } else {
          const result = await fetchGoogleAdsCreatives({
            accessToken,
            developerToken: googleAdsConfig().developerToken,
            customerId: source.connection.external_account_id,
            loginCustomerId: source.connection.login_customer_id,
            campaignIds: source.platform_campaign_ids,
          });
          assets = result.items;
          warnings.push(...result.warnings);
        }
        const applied = await applyCreativeAssets(source.campaign_id, assets, admin);
        if (applied === 0 && assets.length > 0) {
          warnings.push('Aset kreatif ditarik tetapi tiada yang sepadan dengan iklan tersimpan.');
        }
      } catch (error) {
        // A missing thumbnail is not a reason to fail a sync that already
        // delivered the numbers.
        warnings.push(
          `Gambar dan teks iklan tidak dapat ditarik: ${
            error instanceof Error ? error.message : 'sebab tidak diketahui'
          }`,
        );
      }
    }

    await recordSync(source.connection_id, { rows }, admin);

    const more = done < windows.length;
    return {
      ok: true,
      rows,
      warnings,
      more,
      message: more
        ? `${rows} baris ditarik, sehingga ${cover.from ?? target.since}. Tekan sekali lagi untuk menyambung.`
        : `${rows} baris ditarik.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Penyegerakan gagal.';
    await recordSync(
      source.connection_id,
      { rows, error: message, needsReauth: needsReauth(error) },
      admin,
    );
    // Whatever landed before the failure is still real, and still recorded.
    return { ok: false, message, warnings, rows, more: true };
  }
}

function fetchWindow(
  source: CampaignSource,
  accessToken: string,
  window: Window,
): Promise<IngestResult<NormalizedAdMetric>> {
  if (source.connection.platform === 'meta') {
    return fetchMetaInsights({
      accessToken,
      accountId: source.connection.external_account_id,
      since: window.since,
      until: window.until,
      campaignIds: source.platform_campaign_ids,
    });
  }

  const config = googleAdsConfig();
  return fetchGoogleAdsInsights({
    accessToken,
    developerToken: config.developerToken,
    customerId: source.connection.external_account_id,
    loginCustomerId: source.connection.login_customer_id,
    since: window.since,
    until: window.until,
    campaignIds: source.platform_campaign_ids,
  });
}

/**
 * How far back each Onpay run re-walks. Not a resume cursor like Meta/Google's
 * date windows — Onpay's `sales.list` has no date filter at all, only
 * pagination sorted newest-first — so every run simply re-reads this whole
 * rolling window and upserts over it. Harmless: a sale already written just
 * gets the same values again, and this is generous enough to catch a
 * donation confirmed days after it was first attempted.
 */
export const ONPAY_LOOKBACK_DAYS = Number(process.env.ONPAY_LOOKBACK_DAYS) || 30;

const ONPAY_PAGE_SIZE = 100;

/**
 * Onpay has no `campaign_sources` row and no single workspace to sync into —
 * `writeOnpayConversions` routes each donation on its own, by matching the ad
 * code against every creative the account owns. This only ever runs from the
 * one account-wide connection, never once per campaign.
 */
export async function syncOnpay(connection: AdConnection, admin = false): Promise<SyncOutcome> {
  const deadline = Date.now() + BUDGET_MS;
  const cutoff = Date.now() - ONPAY_LOOKBACK_DAYS * 86_400_000;

  try {
    const secrets = await readConnectionSecrets(connection.id, admin);
    const config = onpayConfig();
    if (!config.account) throw new Error('ONPAY_ACCOUNT belum diisi.');

    const donations: ReturnType<typeof mapOnpaySale>[] = [];

    for (let page = 1; ; page += 1) {
      if (Date.now() >= deadline) break;

      const { sales, recordCount } = await fetchOnpaySalesPage({
        account: config.account,
        token: secrets.accessToken,
        page,
        perPage: ONPAY_PAGE_SIZE,
      });
      if (sales.length === 0) break;

      for (const sale of sales) donations.push(mapOnpaySale(sale));

      const oldest = sales[sales.length - 1];
      const reachedCutoff = new Date(oldest.created_at).getTime() < cutoff;
      const reachedEnd = page * ONPAY_PAGE_SIZE >= recordCount;
      if (reachedCutoff || reachedEnd) break;
    }

    const mapped = donations.filter((d): d is NonNullable<typeof d> => d !== null);
    const { written, unmatched, warnings } = await writeOnpayConversions(
      connection.owner_id,
      mapped,
      admin,
    );

    await recordSync(connection.id, { rows: written }, admin);

    return {
      ok: true,
      rows: written,
      warnings,
      more: false,
      message: unmatched > 0
        ? `${written} derma Onpay ditulis, ${unmatched} tiada padanan iklan.`
        : `${written} derma Onpay ditulis.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Penyegerakan Onpay gagal.';
    await recordSync(
      connection.id,
      { rows: 0, error: message, needsReauth: needsReauth(error) },
      admin,
    );
    return { ok: false, message, warnings: [], rows: 0, more: true };
  }
}
