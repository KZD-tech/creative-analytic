import type { IngestResult, NormalizedAdMetric } from '@/lib/ingest/adapter';
import { PlatformError, readJson } from './http';

/**
 * Google Ads API, read-only.
 *
 * Unlike Meta there is no tester-roster shortcut: calls need a developer token
 * from a Google Ads Manager (MCC) account, and a token with only Test access
 * reaches test accounts alone. Basic access has to be applied for before real
 * accounts respond.
 *
 * Versions v22, v23 and v24 were live when this was written; v21 and below
 * return 404. v23 is the default — one behind the newest, which is the usual
 * place to sit for stability.
 */

export const GOOGLE_ADS_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || 'v23';
const ADS_API = `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}`;

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

export function googleAdsAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: GOOGLE_ADS_SCOPE,
    response_type: 'code',
    // Without both of these Google returns no refresh token, and the
    // connection dies an hour later with no way to renew it unattended.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleToken> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });

  const parsed = await readJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  }>(response, 'Google OAuth');

  if (!response.ok || !parsed.access_token) {
    // A refresh token that has been revoked, expired or had its grant removed
    // comes back as invalid_grant — the one Google failure that genuinely needs
    // the account connecting again.
    throw new PlatformError(
      parsed.error_description ?? parsed.error ?? `Google OAuth HTTP ${response.status}`,
      { status: response.status, needsReauth: parsed.error === 'invalid_grant' || response.status === 401 },
    );
  }

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt: parsed.expires_in
      ? new Date(Date.now() + parsed.expires_in * 1000).toISOString()
      : null,
  };
}

export function exchangeGoogleCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<GoogleToken> {
  return tokenRequest({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: 'authorization_code',
  });
}

export function refreshGoogleToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GoogleToken> {
  return tokenRequest({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token',
  });
}

/** Customer ids come back as `customers/1234567890`; the API wants the digits. */
export function customerId(resourceName: string): string {
  return resourceName.replace(/^customers\//, '').replace(/-/g, '');
}

/**
 * searchStream reports an error as a one-element array, everything else as a
 * plain object. Only an authentication refusal (401, or UNAUTHENTICATED) should
 * mark the connection as needing a reconnect; a quota or permission error is
 * about this request, not about the token.
 */
function adsError(parsed: unknown, status: number): PlatformError {
  const body = (Array.isArray(parsed) ? parsed[0] : parsed) as
    | { error?: { message?: string; status?: string } }
    | undefined;
  return new PlatformError(body?.error?.message ?? `Google Ads API HTTP ${status}`, {
    status,
    needsReauth: status === 401 || body?.error?.status === 'UNAUTHENTICATED',
  });
}

export async function listGoogleAdsCustomers(input: {
  accessToken: string;
  developerToken: string;
}): Promise<string[]> {
  const response = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'developer-token': input.developerToken,
    },
    cache: 'no-store',
  });

  const parsed = await readJson<{
    resourceNames?: string[];
    error?: { message?: string };
  }>(response, 'Google Ads');
  if (!response.ok) throw adsError(parsed, response.status);

  return (parsed.resourceNames ?? []).map(customerId);
}

// ── reporting ───────────────────────────────────────────────────────────────

/**
 * Ad-level, one row per day, so the trend charts work the same way they do for
 * Meta. `segments.date` is what makes each row a single day.
 */
export function buildQuery(input: { since: string; until: string; campaignIds?: string[] }): string {
  const filters = [
    `segments.date BETWEEN '${input.since}' AND '${input.until}'`,
    'metrics.impressions > 0',
  ];
  if (input.campaignIds && input.campaignIds.length > 0) {
    filters.push(`campaign.id IN (${input.campaignIds.join(',')})`);
  }

  return `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.final_urls,
      ad_group.name,
      campaign.name,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.video_views,
      metrics.video_quartile_p25_rate,
      metrics.video_quartile_p50_rate,
      metrics.video_quartile_p75_rate,
      metrics.video_quartile_p100_rate
    FROM ad_group_ad
    WHERE ${filters.join(' AND ')}
  `.replace(/\s+/g, ' ').trim();
}

interface GoogleAdsRow {
  adGroupAd?: { ad?: { id?: string; name?: string; finalUrls?: string[] } };
  adGroup?: { name?: string };
  campaign?: { name?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    conversions?: number;
    conversionsValue?: number;
    videoViews?: string | number;
    videoQuartileP25Rate?: number;
    videoQuartileP50Rate?: number;
    videoQuartileP75Rate?: number;
    videoQuartileP100Rate?: number;
  };
}

const int = (value: string | number | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

export function mapGoogleAdsRow(row: GoogleAdsRow): NormalizedAdMetric | null {
  const date = row.segments?.date;
  const ad = row.adGroupAd?.ad;
  if (!date || !ad?.id) return null;

  // Responsive search ads often carry no name; the id keeps the row identifiable
  // instead of dropping it.
  const adName = ad.name?.trim() || `Ad ${ad.id}`;
  const impressions = int(row.metrics?.impressions);

  // Google reports quartiles as rates against impressions, not as counts.
  const quartile = (rate: number | undefined): number =>
    rate && impressions > 0 ? Math.round(rate * impressions) : 0;

  return {
    ad_name: adName,
    adset_name: row.adGroup?.name?.trim() ?? null,
    platform_campaign: row.campaign?.name?.trim() ?? null,
    external_ad_id: ad.id,
    headline: null,
    body_copy: null,
    landing_url: ad.finalUrls?.[0] ?? null,
    date_start: date,
    date_stop: date,
    // Google reports spend in micros of the account currency.
    spend: int(row.metrics?.costMicros) / 1_000_000,
    impressions,
    reach: 0,
    frequency: null,
    clicks_all: int(row.metrics?.clicks),
    link_clicks: int(row.metrics?.clicks),
    landing_page_views: 0,
    video_3s_views: int(row.metrics?.videoViews),
    video_thruplays: quartile(row.metrics?.videoQuartileP100Rate),
    video_p25: quartile(row.metrics?.videoQuartileP25Rate),
    video_p50: quartile(row.metrics?.videoQuartileP50Rate),
    video_p75: quartile(row.metrics?.videoQuartileP75Rate),
    video_p100: quartile(row.metrics?.videoQuartileP100Rate),
    results: int(row.metrics?.conversions),
    platform_purchases: int(row.metrics?.conversions),
    platform_revenue: row.metrics?.conversionsValue ?? 0,
    raw: null,
  };
}

export interface GoogleAdsFetchOptions {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string | null;
  since: string;
  until: string;
  campaignIds?: string[];
}

export async function fetchGoogleAdsInsights(
  options: GoogleAdsFetchOptions,
): Promise<IngestResult<NormalizedAdMetric>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    'developer-token': options.developerToken,
    'Content-Type': 'application/json',
  };
  // Required when the account is reached through a manager account.
  if (options.loginCustomerId) headers['login-customer-id'] = options.loginCustomerId;

  const response = await fetch(
    `${ADS_API}/customers/${options.customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: buildQuery(options) }),
      cache: 'no-store',
    },
  );

  const parsed = await readJson<unknown>(response, 'Google Ads');
  if (!response.ok) throw adsError(parsed, response.status);

  // searchStream answers with an array of batches rather than one result set.
  const batches: { results?: GoogleAdsRow[] }[] = Array.isArray(parsed) ? parsed : [parsed];

  const items: NormalizedAdMetric[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const batch of batches) {
    for (const row of batch.results ?? []) {
      const mapped = mapGoogleAdsRow(row);
      if (mapped) items.push(mapped);
      else skipped += 1;
    }
  }

  if (skipped > 0) warnings.push(`${skipped} baris dilangkau kerana tiada id iklan atau tarikh.`);
  if (items.length === 0) {
    warnings.push('Google Ads tidak memulangkan sebarang baris untuk tempoh ini.');
  }
  warnings.push(
    'Google Ads tidak melaporkan landing page view atau jangkauan di peringkat iklan, jadi dua peringkat funnel itu akan kosong untuk sumber ini.',
  );

  return { items, warnings, skipped };
}
