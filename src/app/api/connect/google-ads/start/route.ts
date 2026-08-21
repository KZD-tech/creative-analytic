import type { NextRequest } from 'next/server';
import { beginOAuth } from '../../_shared';
import { googleAdsAuthUrl } from '@/lib/connections/googleAds';
import { googleAdsConfig } from '@/lib/connections/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return beginOAuth(request, 'google_ads', ({ redirectUri, state }) =>
    googleAdsAuthUrl({ clientId: googleAdsConfig().clientId, redirectUri, state }),
  );
}
