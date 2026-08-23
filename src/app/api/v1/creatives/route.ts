import { authenticate, authoriseCampaign, requireScope } from '@/lib/api/auth';
import { adminDb } from '@/lib/db/client';
import { fail, ok } from '../_respond';

export const dynamic = 'force-dynamic';

/**
 * The ad list an agent matches donations against.
 *
 * `ad_name_key` is included deliberately: it is the normalised form the writer
 * matches on, so an agent that compares against it gets the same answer the
 * dashboard would, instead of reinventing the normalisation and disagreeing.
 */
export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const scope = requireScope(auth.caller, 'read');
  if (!scope.ok) return fail(scope.status, scope.error);

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaign') ?? auth.caller.campaignId;
  if (!campaignId) {
    return fail(400, 'Nyatakan ?campaign=<id>. Kunci ini tidak terhad kepada satu kempen.');
  }

  const allowed = await authoriseCampaign(auth.caller, campaignId);
  if (!allowed.ok) return fail(allowed.status, allowed.error);

  const { data, error } = await adminDb()
    .from('creatives')
    .select(
      'id, ad_name, ad_name_key, adset_name, platform_campaign, external_ad_id, headline, body_copy, landing_url, media_url, first_seen, last_seen',
    )
    .eq('campaign_id', campaignId)
    .order('ad_name');

  if (error) return fail(500, error.message);

  return ok({ campaign_id: campaignId, count: (data ?? []).length, creatives: data ?? [] });
}
