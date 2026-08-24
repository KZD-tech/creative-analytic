import 'server-only';
import { describeMetaAdAccount, listMetaAdAccounts } from '@/lib/connections/meta';
import { listGoogleAdsCustomers, refreshGoogleToken } from '@/lib/connections/googleAds';
import {
  googleAdsConfig, googleAdsDirectConfig, metaConfig, systemUserConfig,
} from '@/lib/connections/config';
import { saveConnection, linkCampaign } from '@/lib/db/connections';
import type { MetaAdAccount } from '@/lib/connections/meta';

/**
 * Turns a system-user token from the environment into a saved connection.
 *
 * The token is still encrypted before it is stored, exactly as an OAuth one is,
 * so the environment holds it only until the first import.
 */
export async function importSystemUserConnection(input: {
  userId: string;
  campaignId: string;
}): Promise<{ imported: MetaAdAccount[] }> {
  const { token, accountIds } = systemUserConfig();
  if (!token) throw new Error('META_SYSTEM_USER_TOKEN belum diisi.');

  // Named accounts are read one by one; without names, fall back to asking the
  // token what it can see.
  const accounts = accountIds.length > 0
    ? await Promise.all(accountIds.map((id) => describeMetaAdAccount(token, id)))
    : await listMetaAdAccounts(token, metaConfig());

  if (accounts.length === 0) throw new Error('Tiada akaun iklan dijumpai untuk token ini.');

  for (const account of accounts) {
    const connectionId = await saveConnection({
      ownerId: input.userId,
      platform: 'meta',
      externalAccountId: account.id,
      accountName: account.name,
      currency: account.currency,
      timezone: account.timezone,
      accessToken: token,
      // A system-user token does not expire; nothing should ask it to renew.
      expiresAt: null,
    });
    await linkCampaign({ campaignId: input.campaignId, connectionId });
  }

  return { imported: accounts };
}

/**
 * Turns a Google Ads refresh token from the environment into a saved
 * connection, without the account owner going through this app's own
 * consent screen.
 *
 * A pasted-in refresh token has no accompanying access token, unlike Meta's
 * long-lived system-user token, so this exchanges it once up front — which
 * doubles as proof the token, client id/secret and developer token actually
 * work together before anything is saved. Every sync after this refreshes it
 * again on its own (see `syncSource` in `lib/connections/sync.ts`).
 */
export async function importGoogleAdsDirectConnection(input: {
  userId: string;
  campaignId: string;
}): Promise<{ imported: string[] }> {
  const { refreshToken, customerIds } = googleAdsDirectConfig();
  if (!refreshToken) throw new Error('GOOGLE_ADS_REFRESH_TOKEN belum diisi.');

  const config = googleAdsConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET belum diisi.');
  }
  if (!config.developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN belum diisi.');

  const token = await refreshGoogleToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken,
  });

  // Named accounts skip the lookup; without them, ask the token what it can
  // reach — same shape as Meta's system-user import above.
  const customers = customerIds.length > 0
    ? customerIds
    : await listGoogleAdsCustomers({
        accessToken: token.accessToken,
        developerToken: config.developerToken,
      });

  if (customers.length === 0) {
    throw new Error('Tiada akaun Google Ads dijumpai untuk refresh token ini.');
  }

  for (const id of customers) {
    const connectionId = await saveConnection({
      ownerId: input.userId,
      platform: 'google_ads',
      externalAccountId: id,
      accountName: `Google Ads ${id}`,
      currency: null,
      timezone: null,
      loginCustomerId: config.loginCustomerId,
      accessToken: token.accessToken,
      refreshToken,
      expiresAt: token.expiresAt,
    });
    await linkCampaign({ campaignId: input.campaignId, connectionId });
  }

  return { imported: customers };
}
