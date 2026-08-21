import 'server-only';
import { fetchMetaInsights } from './meta';
import { fetchGoogleAdsInsights, refreshGoogleToken } from './googleAds';
import { googleAdsConfig } from './config';
import { needsReauth } from './http';
import {
  readConnectionSecrets, recordSync, updateAccessToken, type CampaignSource,
} from '@/lib/db/connections';
import { writeAdMetrics } from '@/lib/db/ingest';
import type { IngestResult, NormalizedAdMetric } from '@/lib/ingest/adapter';

export interface SyncOutcome {
  ok: boolean;
  message: string;
  warnings: string[];
  rows: number;
}

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
  const { since, until } = windowFor(days);
  const platform = source.connection.platform;

  try {
    const secrets = await readConnectionSecrets(source.connection_id);
    let result: IngestResult<NormalizedAdMetric>;

    if (platform === 'meta') {
      result = await fetchMetaInsights({
        accessToken: secrets.accessToken,
        accountId: source.connection.external_account_id,
        since,
        until,
        campaignIds: source.platform_campaign_ids,
      });
    } else {
      const config = googleAdsConfig();
      let accessToken = secrets.accessToken;

      // Google access tokens last an hour, so a scheduled sync is almost always
      // running with an expired one. Refresh first rather than fail and retry.
      if (secrets.refreshToken) {
        const refreshed = await refreshGoogleToken({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken: secrets.refreshToken,
        });
        accessToken = refreshed.accessToken;
        await updateAccessToken(source.connection_id, accessToken, refreshed.expiresAt);
      }

      result = await fetchGoogleAdsInsights({
        accessToken,
        developerToken: config.developerToken,
        customerId: source.connection.external_account_id,
        loginCustomerId: source.connection.login_customer_id,
        since,
        until,
        campaignIds: source.platform_campaign_ids,
      });
    }

    if (result.items.length === 0) {
      await recordSync(source.connection_id, { rows: 0 });
      return {
        ok: true,
        message: 'Tiada baris baharu untuk tempoh ini.',
        warnings: result.warnings,
        rows: 0,
      };
    }

    // The same writer the CSV path uses: snapshots, rollback, creative matching
    // and first/last seen all come along unchanged.
    const outcome = await writeAdMetrics(source.campaign_id, result.items, {
      source: platform === 'meta' ? 'meta_api' : 'google_ads',
      filename: null,
      skipped: result.skipped,
      warnings: result.warnings,
    });

    await recordSync(source.connection_id, { rows: outcome.inserted + outcome.updated });

    return {
      ok: true,
      message: `${outcome.inserted} baris baharu, ${outcome.updated} dikemas kini.`,
      warnings: outcome.warnings,
      rows: outcome.inserted + outcome.updated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Penyegerakan gagal.';
    await recordSync(source.connection_id, {
      rows: 0,
      error: message,
      needsReauth: needsReauth(error),
    });
    return { ok: false, message, warnings: [], rows: 0 };
  }
}
