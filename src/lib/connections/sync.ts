import 'server-only';
import { fetchMetaCreatives, fetchMetaInsights } from './meta';
import { fetchGoogleAdsInsights, refreshGoogleToken } from './googleAds';
import { googleAdsConfig } from './config';
import { needsReauth } from './http';
import { extendCover, pendingWindows, type Window } from './windows';
import {
  readConnectionSecrets, recordCover, recordSync, updateAccessToken, type CampaignSource,
} from '@/lib/db/connections';
import { applyCreativeAssets, writeAdMetrics } from '@/lib/db/ingest';
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
    if (platform === 'meta' && rows > 0 && Date.now() < overallDeadline) {
      try {
        const assets = await fetchMetaCreatives({
          accessToken,
          accountId: source.connection.external_account_id,
          campaignIds: source.platform_campaign_ids,
          deadline: overallDeadline,
        });
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
