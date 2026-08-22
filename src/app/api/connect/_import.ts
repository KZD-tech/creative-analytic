import 'server-only';
import { describeMetaAdAccount, listMetaAdAccounts } from '@/lib/connections/meta';
import { metaConfig, systemUserConfig } from '@/lib/connections/config';
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
