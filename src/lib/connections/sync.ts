import 'server-only';
import { fetchMetaInsights } from './meta';
import { fetchGoogleAdsInsights, refreshGoogleToken } from './googleAds';
import { googleAdsConfig } from './config';
import { needsReauth } from './http';
import { extendCover, pendingWindows, type Window } from './windows';
import {
  readConnectionSecrets, recordCover, recordSync, updateAccessToken, type CampaignSource,
} from '@/lib/db/connections';
import { writeAdMetrics } from '@/lib/db/ingest';
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
const BUDGET_MS = 40_000;

/** Meta and Google both settle their numbers for a few days after the fact. */
export const DEFAULT_LOOKBACK_DAYS = 30;

function windowFor(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

export async function syncSource(
  source: CampaignSource,
  days = DEFAULT_LOOKBACK_DAYS,
): Promise<SyncOutcome> {
  const target = windowFor(days);
  const platform = source.connection.platform;
  const deadline = Date.now() + BUDGET_MS;

  let cover: { from: string | null; through: string | null } = {
    from: source.connection.synced_from,
    through: source.connection.synced_through,
  };
  const windows = pendingWindows(target, cover);

  if (windows.length === 0) {
    await recordSync(source.connection_id, { rows: 0 });
    return { ok: true, message: 'Sudah terkini.', warnings: [], rows: 0, more: false };
  }

  let rows = 0;
  let done = 0;
  const warnings: string[] = [];

  try {
    const secrets = await readConnectionSecrets(source.connection_id);
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
      await updateAccessToken(source.connection_id, accessToken, refreshed.expiresAt);
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
        });
        rows += outcome.inserted + outcome.updated;
        warnings.push(...outcome.warnings);
      }

      // Saved per window, so an interrupted run still moves the cursor.
      const extended = extendCover(cover, window);
      await recordCover(source.connection_id, extended);
      cover = extended;
      done += 1;

      if (Date.now() >= deadline) break;
    }

    await recordSync(source.connection_id, { rows });

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
    await recordSync(source.connection_id, {
      rows,
      error: message,
      needsReauth: needsReauth(error),
    });
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
