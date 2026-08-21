import { NextResponse, type NextRequest } from 'next/server';
import { backToData } from '../../_shared';
import { currentUser } from '@/lib/auth/session';
import { callbackUrl, googleAdsConfig, verifyState } from '@/lib/connections/config';
import { exchangeGoogleCode, listGoogleAdsCustomers } from '@/lib/connections/googleAds';
import { saveConnection, linkCampaign } from '@/lib/db/connections';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const state = verifyState(searchParams.get('state') ?? '');
  if (!state) return NextResponse.redirect(new URL('/', origin));

  const user = await currentUser();
  if (!user || user.id !== state.userId) {
    return backToData(state.campaignId, { connect_error: 'Sesi tidak sepadan. Cuba lagi.' }, origin);
  }

  const denied = searchParams.get('error');
  if (denied) return backToData(state.campaignId, { connect_error: denied }, origin);

  const code = searchParams.get('code');
  if (!code) return backToData(state.campaignId, { connect_error: 'Google tidak memberi kod.' }, origin);

  try {
    const config = googleAdsConfig();
    const token = await exchangeGoogleCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: callbackUrl('google_ads'),
      code,
    });

    if (!token.refreshToken) {
      return backToData(
        state.campaignId,
        {
          connect_error:
            'Google tidak memberi refresh token. Buang akses aplikasi ini di myaccount.google.com/permissions, kemudian cuba lagi.',
        },
        origin,
      );
    }

    const customers = await listGoogleAdsCustomers({
      accessToken: token.accessToken,
      developerToken: config.developerToken,
    });

    if (customers.length === 0) {
      return backToData(
        state.campaignId,
        { connect_error: 'Tiada akaun Google Ads boleh diakses oleh akaun ini.' },
        origin,
      );
    }

    let firstId = '';
    for (const customer of customers) {
      const id = await saveConnection({
        ownerId: user.id,
        platform: 'google_ads',
        externalAccountId: customer,
        accountName: `Google Ads ${customer}`,
        currency: null,
        timezone: null,
        loginCustomerId: config.loginCustomerId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
      });
      if (!firstId) firstId = id;
    }

    if (customers.length === 1) {
      await linkCampaign({ campaignId: state.campaignId, connectionId: firstId });
    }

    return backToData(
      state.campaignId,
      {
        connect_ok:
          customers.length === 1
            ? `Akaun Google Ads ${customers[0]} disambungkan.`
            : `${customers.length} akaun Google Ads disambungkan. Pilih yang mana untuk kempen ini.`,
      },
      origin,
    );
  } catch (error) {
    return backToData(
      state.campaignId,
      { connect_error: error instanceof Error ? error.message : 'Sambungan Google Ads gagal.' },
      origin,
    );
  }
}
