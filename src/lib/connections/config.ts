import { createHmac, timingSafeEqual } from 'node:crypto';
import { encryptionConfigured } from './crypto';
import { siteUrl } from '@/lib/env';

export type Platform = 'meta' | 'google_ads';

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
};

export interface PlatformStatus {
  platform: Platform;
  ready: boolean;
  /** Named so the setup screen can say exactly what is missing. */
  missing: string[];
}

export function metaConfig() {
  return {
    appId: process.env.META_APP_ID?.trim() ?? '',
    appSecret: process.env.META_APP_SECRET?.trim() ?? '',
  };
}

export function googleAdsConfig() {
  return {
    // The same OAuth client used for signing in works here too — it only needs
    // this app's callback added to its authorised redirect URIs.
    clientId: (process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)?.trim() ?? '',
    clientSecret:
      (process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)?.trim() ?? '',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? '',
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim() || null,
  };
}

export function platformStatus(platform: Platform): PlatformStatus {
  const missing: string[] = [];
  if (!encryptionConfigured()) missing.push('TOKEN_ENCRYPTION_KEY');

  if (platform === 'meta') {
    const { appId, appSecret } = metaConfig();
    if (!appId) missing.push('META_APP_ID');
    if (!appSecret) missing.push('META_APP_SECRET');
  } else {
    const { clientId, clientSecret, developerToken } = googleAdsConfig();
    if (!clientId) missing.push('GOOGLE_ADS_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_ADS_CLIENT_SECRET');
    if (!developerToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
  }

  return { platform, ready: missing.length === 0, missing };
}

export function callbackUrl(platform: Platform): string {
  return `${siteUrl()}/api/connect/${platform === 'meta' ? 'meta' : 'google-ads'}/callback`;
}

// ── OAuth state ─────────────────────────────────────────────────────────────

function stateSecret(): string {
  return (
    process.env.APP_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'creative-analytic-state'
  );
}

/**
 * The `state` parameter is the only thing standing between this flow and a
 * cross-site request that attaches an attacker's ad account to someone else's
 * campaign, so it is signed and carries the user it was issued to.
 */
export function signState(payload: { userId: string; campaignId: string; nonce: string }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(
  state: string,
): { userId: string; campaignId: string; nonce: string } | null {
  const [body, mac] = state.split('.');
  if (!body || !mac) return null;

  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const given = Buffer.from(mac);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}
