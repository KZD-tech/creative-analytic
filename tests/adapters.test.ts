import assert from 'node:assert/strict';
import test from 'node:test';
import { mapMetaInsight, metaAuthUrl, META_SCOPES } from '@/lib/connections/meta';
import {
  buildQuery, customerId, googleAdsAuthUrl, mapGoogleAdsRow, GOOGLE_ADS_SCOPE,
} from '@/lib/connections/googleAds';

// ── Meta ────────────────────────────────────────────────────────────────────

/** Shaped like a real ad-level insights row with time_increment=1. */
const metaRow = {
  ad_id: '120210000000000001',
  ad_name: 'Rumah Padi V1H1',
  adset_name: 'Set A',
  campaign_id: '23850000000000001',
  campaign_name: 'Ramadan 2026',
  spend: '150.75',
  impressions: '8500',
  reach: '5200',
  frequency: '1.635',
  clicks: '212',
  inline_link_clicks: '180',
  actions: [
    { action_type: 'post_engagement', value: '340' },
    { action_type: 'landing_page_view', value: '55' },
    { action_type: 'purchase', value: '3' },
  ],
  action_values: [
    { action_type: 'omni_purchase', value: '640.50' },
    { action_type: 'purchase', value: '620.00' },
  ],
  video_play_actions: [{ action_type: 'video_view', value: '1530' }],
  video_thruplay_watched_actions: [{ action_type: 'video_view', value: '420' }],
  video_p25_watched_actions: [{ action_type: 'video_view', value: '900' }],
  video_p100_watched_actions: [{ action_type: 'video_view', value: '210' }],
  date_start: '2026-03-01',
  date_stop: '2026-03-01',
};

test('Meta insight maps onto the shared shape', () => {
  const m = mapMetaInsight(metaRow)!;
  assert.equal(m.ad_name, 'Rumah Padi V1H1');
  assert.equal(m.adset_name, 'Set A');
  assert.equal(m.platform_campaign, 'Ramadan 2026');
  assert.equal(m.external_ad_id, '120210000000000001');
  assert.equal(m.spend, 150.75);
  assert.equal(m.impressions, 8500);
  assert.equal(m.link_clicks, 180);
  assert.equal(m.clicks_all, 212);
  assert.equal(m.video_3s_views, 1530);
  assert.equal(m.video_thruplays, 420);
  // A daily row: both ends of the window are the same day, which is what makes
  // the trend charts and the fatigue curve work.
  assert.equal(m.date_start, '2026-03-01');
  assert.equal(m.date_stop, '2026-03-01');
});

test('actions are picked by type, never by position', () => {
  // landing_page_view sits behind post_engagement here. Reading actions[0]
  // would silently report 340 landing page views instead of 55.
  const m = mapMetaInsight(metaRow)!;
  assert.equal(m.landing_page_views, 55);
  assert.equal(m.results, 3);
});

test('purchase value prefers the exact purchase type over omni', () => {
  const m = mapMetaInsight(metaRow)!;
  assert.equal(m.platform_revenue, 620);
});

test('a pixel-only account still reports its purchases', () => {
  const m = mapMetaInsight({
    ...metaRow,
    actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '7' }],
    action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '910' }],
  })!;
  assert.equal(m.results, 7);
  assert.equal(m.platform_revenue, 910);
});

test('missing action arrays produce zeros, not NaN', () => {
  const m = mapMetaInsight({ ad_name: 'Bare', date_start: '2026-03-01' })!;
  for (const value of [m.spend, m.impressions, m.landing_page_views, m.platform_revenue,
                       m.video_3s_views, m.results]) {
    assert.equal(Number.isFinite(value), true);
    assert.equal(value, 0);
  }
});

test('a row without an ad name or date is dropped, not half-imported', () => {
  assert.equal(mapMetaInsight({ ad_id: '1', date_start: '2026-03-01' }), null);
  assert.equal(mapMetaInsight({ ad_name: 'X' }), null);
});

test('Meta consent URL asks only for read scopes', () => {
  const url = new URL(metaAuthUrl({ appId: '123', redirectUri: 'https://x.test/cb', state: 's' }));
  assert.equal(url.searchParams.get('scope'), META_SCOPES);
  assert.ok(!META_SCOPES.includes('ads_management'), 'read-only: must not request management');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://x.test/cb');
  assert.equal(url.searchParams.get('state'), 's');
});

// ── Google Ads ──────────────────────────────────────────────────────────────

const googleRow = {
  adGroupAd: {
    ad: { id: '712345678901', name: 'Search Ad A', finalUrls: ['https://derma.test/ramadan'] },
  },
  adGroup: { name: 'Kumpulan A' },
  campaign: { name: 'Search Ramadan' },
  segments: { date: '2026-03-01' },
  metrics: {
    costMicros: '152340000',
    impressions: '9000',
    clicks: '260',
    conversions: 4,
    conversionsValue: 480.5,
    videoViews: '0',
    videoQuartileP25Rate: 0.5,
    videoQuartileP100Rate: 0.1,
  },
};

test('Google Ads row maps onto the same shape, with micros converted', () => {
  const m = mapGoogleAdsRow(googleRow)!;
  assert.equal(m.ad_name, 'Search Ad A');
  assert.equal(m.adset_name, 'Kumpulan A');
  assert.equal(m.platform_campaign, 'Search Ramadan');
  // 152,340,000 micros is RM152.34 — reading it raw would overstate spend a
  // millionfold and make every ROAS on the page meaningless.
  assert.equal(m.spend, 152.34);
  assert.equal(m.impressions, 9000);
  assert.equal(m.results, 4);
  assert.equal(m.platform_revenue, 480.5);
  assert.equal(m.landing_url, 'https://derma.test/ramadan');
});

test('video quartiles are rates against impressions, converted to counts', () => {
  const m = mapGoogleAdsRow(googleRow)!;
  assert.equal(m.video_p25, 4500);  // 0.5 × 9000
  assert.equal(m.video_p100, 900);  // 0.1 × 9000
});

test('an unnamed responsive ad keeps its id rather than being dropped', () => {
  const m = mapGoogleAdsRow({ ...googleRow, adGroupAd: { ad: { id: '999' } } })!;
  assert.equal(m.ad_name, 'Ad 999');
  assert.equal(m.external_ad_id, '999');
});

test('a row with no ad id or date is dropped', () => {
  assert.equal(mapGoogleAdsRow({ segments: { date: '2026-03-01' } }), null);
  assert.equal(mapGoogleAdsRow({ adGroupAd: { ad: { id: '1' } } }), null);
});

test('GAQL selects one row per ad per day and honours a campaign filter', () => {
  const query = buildQuery({ since: '2026-03-01', until: '2026-03-31' });
  assert.match(query, /FROM ad_group_ad/);
  assert.match(query, /segments\.date BETWEEN '2026-03-01' AND '2026-03-31'/);
  assert.ok(!query.includes('campaign.id IN'), 'no filter when none was asked for');

  const filtered = buildQuery({ since: '2026-03-01', until: '2026-03-31', campaignIds: ['11', '22'] });
  assert.match(filtered, /campaign\.id IN \(11,22\)/);
});

test('customer ids are normalised to bare digits', () => {
  assert.equal(customerId('customers/1234567890'), '1234567890');
  assert.equal(customerId('123-456-7890'), '1234567890');
  assert.equal(customerId('1234567890'), '1234567890');
});

test('Google consent URL requests offline access, or the token dies in an hour', () => {
  const url = new URL(googleAdsAuthUrl({ clientId: 'c', redirectUri: 'https://x.test/cb', state: 's' }));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('scope'), GOOGLE_ADS_SCOPE);
});

// ── Facebook Login for Business ─────────────────────────────────────────────
// Apps created through the use-case flow get the business login variant, which
// takes a saved configuration id rather than a scope list.

test('metaAuthUrl sends config_id, and no scope, when one is configured', () => {
  const url = new URL(
    metaAuthUrl({ appId: '123', redirectUri: 'https://x.test/cb', state: 'st', configId: 'cfg_9' }),
  );
  assert.equal(url.searchParams.get('config_id'), 'cfg_9');
  assert.equal(url.searchParams.get('scope'), null, 'scope and config_id are mutually exclusive');
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('metaAuthUrl falls back to the classic scope list without one', () => {
  for (const configId of [undefined, null, '']) {
    const url = new URL(
      metaAuthUrl({ appId: '123', redirectUri: 'https://x.test/cb', state: 'st', configId }),
    );
    assert.equal(url.searchParams.get('scope'), 'ads_read,business_management');
    assert.equal(url.searchParams.get('config_id'), null);
  }
});
