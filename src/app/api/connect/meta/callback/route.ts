import { NextResponse, type NextRequest } from 'next/server';
import { backToData } from '../../_shared';
import { currentUser } from '@/lib/auth/session';
import { callbackUrl, metaConfig, verifyState } from '@/lib/connections/config';
import { exchangeMetaCode, listMetaAdAccounts } from '@/lib/connections/meta';
import { saveConnection, linkCampaign } from '@/lib/db/connections';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const state = verifyState(searchParams.get('state') ?? '');
  if (!state) return NextResponse.redirect(new URL('/', origin));

  // The signature proves the state came from us; this proves the person
  // finishing the flow is the one who started it.
  const user = await currentUser();
  if (!user || user.id !== state.userId) {
    return backToData(state.campaignId, { connect_error: 'Sesi tidak sepadan. Cuba lagi.' }, origin);
  }

  const denied = searchParams.get('error_description') ?? searchParams.get('error');
  if (denied) return backToData(state.campaignId, { connect_error: denied }, origin);

  const code = searchParams.get('code');
  if (!code) return backToData(state.campaignId, { connect_error: 'Meta tidak memberi kod.' }, origin);

  try {
    const { appId, appSecret } = metaConfig();
    const token = await exchangeMetaCode({
      appId,
      appSecret,
      redirectUri: callbackUrl('meta'),
      code,
    });

    const accounts = await listMetaAdAccounts(token.accessToken);
    if (accounts.length === 0) {
      return backToData(
        state.campaignId,
        { connect_error: 'Tiada akaun iklan pada akaun Meta ini. Pastikan anda ada akses Ads.' },
        origin,
      );
    }

    // Every account the person can reach is saved, so the campaign can be
    // pointed at any of them afterwards without repeating the consent screen.
    let firstId = '';
    for (const account of accounts) {
      const id = await saveConnection({
        ownerId: user.id,
        platform: 'meta',
        externalAccountId: account.id,
        accountName: account.name,
        currency: account.currency,
        timezone: account.timezone,
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      });
      if (!firstId) firstId = id;
    }

    if (accounts.length === 1) await linkCampaign({ campaignId: state.campaignId, connectionId: firstId });

    return backToData(
      state.campaignId,
      {
        connect_ok:
          accounts.length === 1
            ? `${accounts[0].name} disambungkan.`
            : `${accounts.length} akaun Meta disambungkan. Pilih yang mana untuk kempen ini.`,
      },
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sambungan Meta gagal.';
    return backToData(state.campaignId, { connect_error: `${message} ${flowHint()}` }, origin);
  }
}

/**
 * Says which login flow actually ran.
 *
 * Without this, a token that comes back carrying the wrong permissions is
 * ambiguous: the login configuration might be wrong, or it might be correct and
 * simply never reached the app — an env var missing, or set but not redeployed.
 * Those have opposite fixes, and the token alone cannot tell them apart.
 */
function flowHint(): string {
  const configId = metaConfig().loginConfigId;
  return configId
    ? `(Aliran: Login for Business, config ${configId}.)`
    : '(Aliran: scope klasik — META_LOGIN_CONFIG_ID tidak sampai ke aplikasi ini. ' +
      'Kalau app anda menggunakan Facebook Login for Business, isinya diabaikan dan ' +
      'token tidak akan membawa permission yang diminta.)';
}
