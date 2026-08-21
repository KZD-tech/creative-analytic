import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFbAdsCsv } from '@/lib/ingest/fbAds';
import { extractAdName, parseConversionsCsv } from '@/lib/ingest/conversions';
import { classifyMedia, parseMediaLinksCsv, youtubeId } from '@/lib/ingest/mediaLinks';
import { landingKey } from '@/lib/ingest/normalize';

test('FB parser reads a daily-breakdown export', () => {
  const csv = [
    'Ad name,Ad set name,Day,Amount spent (MYR),Impressions,Reach,Link clicks,Landing page views,3-second video plays,ThruPlays',
    'V1H1,Set A,2026-03-01,150.00,8500,5200,180,55,1530,420',
    'V1H1,Set A,2026-03-02,120.00,7000,4800,150,44,1200,380',
  ].join('\n');

  const { items, skipped } = parseFbAdsCsv(csv);
  assert.equal(skipped, 0);
  assert.equal(items.length, 2);
  assert.equal(items[0].ad_name, 'V1H1');
  assert.equal(items[0].adset_name, 'Set A');
  assert.equal(items[0].date_start, '2026-03-01');
  assert.equal(items[0].date_stop, '2026-03-01');
  assert.equal(items[0].spend, 150);
  assert.equal(items[0].video_3s_views, 1530);
});

test('FB parser rebuilds counts from rate-only and cost-only columns', () => {
  // This is the shape of the previous dashboard's template: no Link clicks and
  // no 3-second plays, only CPC, cost per LPV and a hook rate.
  const csv = [
    'Ad name,Amount spent (MYR),Impressions,CTR (all),Hook Hold Rate,Cost per landing page view,CPC (cost per link click),Purchase ROAS (return on ad spend),Reporting starts,Reporting ends',
    'V1H1,150.00,8500,2.50,0.18,2.73,0.82,1.20,2026-03-01,2026-03-31',
  ].join('\n');

  const { items } = parseFbAdsCsv(csv);
  const row = items[0];
  assert.equal(row.date_start, '2026-03-01');
  assert.equal(row.date_stop, '2026-03-31');
  assert.equal(row.clicks_all, Math.round(0.025 * 8500)); // 213
  assert.equal(row.link_clicks, Math.round(150 / 0.82)); // 183
  assert.equal(row.landing_page_views, Math.round(150 / 2.73)); // 55
  assert.equal(row.video_3s_views, Math.round(0.18 * 8500)); // 1530
  assert.equal(row.platform_revenue, 180); // 1.20 ROAS × 150 spend
});

test('FB parser skips rows without an ad name and reports it', () => {
  const csv = ['Ad name,Day,Amount spent (MYR),Impressions', ',2026-03-01,10,100', 'V1,2026-03-01,10,100'].join('\n');
  const { items, skipped, warnings } = parseFbAdsCsv(csv);
  assert.equal(items.length, 1);
  assert.equal(skipped, 1);
  assert.ok(warnings.some((w) => w.includes('dilangkau')));
});

test('FB parser refuses a file with no ad-name column', () => {
  const { items, warnings } = parseFbAdsCsv('Impressions,Spend\n100,10');
  assert.equal(items.length, 0);
  assert.ok(warnings.some((w) => w.includes('Ad name')));
});

test('conversions parser reads Onpay exports and lifts the ad name', () => {
  const csv = [
    '#,Nama,Emel,Jumlah Keseluruhan (RM),Tambahan #2,Tambahan #3,Tarikh & Masa (Dimasukkan)',
    '1001,Ahmad,a@e.com,50.00,Facebook (new),Kempen | Set A | V1H1,2026-03-01 10:30:00',
    '1002,Siti,s@e.com,"1,250.00",Facebook (returning),Kempen | Set A | V1H2,2026-03-02 14:20:00',
  ].join('\n');

  const { items } = parseConversionsCsv(csv, 'Asia/Kuala_Lumpur');
  assert.equal(items.length, 2);
  assert.equal(items[0].external_id, '1001');
  assert.equal(items[0].amount, 50);
  assert.equal(items[0].ad_name_hint, 'V1H1');
  assert.equal(items[0].occurred_at, '2026-03-01T02:30:00.000Z');
  assert.equal(items[1].amount, 1250);
  // Donor name and email are read past, never carried into the normalized row.
  assert.equal('donor_name' in items[0], false);
});

test('conversions without attribution are kept but flagged', () => {
  const csv = [
    '#,Jumlah Keseluruhan (RM),Tarikh & Masa (Dimasukkan)',
    '1,25.00,2026-03-01 10:00:00',
  ].join('\n');
  const { items, warnings } = parseConversionsCsv(csv, 'Asia/Kuala_Lumpur');
  assert.equal(items.length, 1);
  assert.equal(items[0].ad_name_hint, null);
  assert.ok(warnings.some((w) => w.includes('tiada rujukan iklan')));
});

test('extractAdName takes the last segment of the attribution string', () => {
  assert.equal(extractAdName('Kempen | Set A | V1H1'), 'V1H1');
  assert.equal(extractAdName('V1H1'), 'V1H1');
  assert.equal(extractAdName('  Kempen |  | V2H3  '), 'V2H3');
  assert.equal(extractAdName(null), null);
});

test('media links parser and YouTube id extraction', () => {
  const csv = [
    'ad_name,youtube_url',
    'V1H1,https://youtu.be/dQw4w9WgXcQ',
    'V1H2,https://www.youtube.com/shorts/abc123XYZ',
    ',https://youtu.be/orphan',
  ].join('\n');
  const { items, skipped } = parseMediaLinksCsv(csv);
  assert.equal(items.length, 2);
  assert.equal(skipped, 1);

  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/shorts/abc123XYZ'), 'abc123XYZ');
  assert.equal(youtubeId('https://cdn.example.com/a.mp4'), null);

  assert.equal(classifyMedia('https://youtu.be/dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(classifyMedia('https://cdn.example.com/a.mp4').kind, 'video');
  assert.equal(classifyMedia('https://cdn.example.com/a.jpg').kind, 'image');
  assert.equal(classifyMedia(null).kind, 'none');
});

test('FB parser picks up headline, body copy and destination when present', () => {
  const csv = [
    'Ad name,Day,Amount spent (MYR),Impressions,Title,Body,Link',
    'V1H1,2026-03-01,150,8500,"Derma hari ini","Setiap RM10 memberi makan seorang anak.",https://derma.example.com/ramadan?utm_source=fb&fbclid=xyz',
  ].join('\n');

  const { items } = parseFbAdsCsv(csv);
  assert.equal(items[0].headline, 'Derma hari ini');
  assert.equal(items[0].body_copy, 'Setiap RM10 memberi makan seorang anak.');
  assert.equal(items[0].landing_url, 'https://derma.example.com/ramadan?utm_source=fb&fbclid=xyz');
});

test('an export without copy columns warns instead of failing', () => {
  const csv = ['Ad name,Day,Amount spent (MYR),Impressions', 'V1H1,2026-03-01,150,8500'].join('\n');
  const { items, warnings } = parseFbAdsCsv(csv);
  assert.equal(items.length, 1);
  assert.equal(items[0].headline, null);
  assert.ok(warnings.some((w) => w.includes('Headlines')));
});

test('landingKey groups by host and path, ignoring tracking parameters', () => {
  assert.equal(landingKey('https://www.derma.com/ramadan?utm_source=fb'), 'derma.com/ramadan');
  assert.equal(landingKey('https://derma.com/ramadan/'), 'derma.com/ramadan');
  assert.equal(landingKey('derma.com/ramadan?fbclid=1'), 'derma.com/ramadan');
  // Two ads pointing at the same page group together even with different UTMs.
  assert.equal(
    landingKey('https://derma.com/ramadan?utm_campaign=a'),
    landingKey('https://derma.com/ramadan?utm_campaign=b'),
  );
  assert.equal(landingKey(null), null);
});
