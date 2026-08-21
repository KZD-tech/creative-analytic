import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser } from '@/lib/auth/session';
import { callbackUrl, platformStatus, signState, type Platform } from '@/lib/connections/config';

/** Sends the browser back to the campaign's Data tab with a message to show. */
export function backToData(
  campaignId: string,
  params: Record<string, string>,
  origin: string,
): NextResponse {
  const url = new URL(`/c/${encodeURIComponent(campaignId)}/data`, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function beginOAuth(
  request: Request,
  platform: Platform,
  buildUrl: (input: { redirectUri: string; state: string }) => string,
): Promise<NextResponse> {
  const user = await requireUser();
  const { searchParams, origin } = new URL(request.url);
  const campaignId = searchParams.get('campaign') ?? '';

  if (!campaignId) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const status = platformStatus(platform);
  if (!status.ready) {
    return backToData(
      campaignId,
      { connect_error: `Konfigurasi belum lengkap: ${status.missing.join(', ')}` },
      origin,
    );
  }

  const state = signState({
    userId: user.id,
    campaignId,
    nonce: randomBytes(12).toString('base64url'),
  });

  return NextResponse.redirect(buildUrl({ redirectUri: callbackUrl(platform), state }));
}
