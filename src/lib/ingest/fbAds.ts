import { hasAnyColumn, parseCsv, pick } from './csv';
import { toDate, toInt, toNumber, toRate } from './normalize';
import type { IngestResult, NormalizedAdMetric } from './adapter';

// Meta renames columns between export presets and localises the currency into
// the header, so every field is looked up through a list of aliases.
const A = {
  adName: ['ad_name', 'nama_iklan', 'ad'],
  adsetName: ['ad_set_name', 'adset_name', 'nama_set_iklan'],
  campaignName: ['campaign_name', 'nama_kempen'],
  adId: ['ad_id', 'ad_id_'],
  day: ['day', 'date', 'tarikh'],
  start: ['reporting_starts', 'date_start', 'starts'],
  stop: ['reporting_ends', 'date_stop', 'ends'],
  spend: [
    'amount_spent_myr',
    'amount_spent_usd',
    'amount_spent_sgd',
    'amount_spent_idr',
    'amount_spent',
    'spend',
    'jumlah_dibelanjakan',
  ],
  impressions: ['impressions', 'impresi'],
  reach: ['reach', 'jangkauan'],
  frequency: ['frequency', 'kekerapan'],
  clicksAll: ['clicks_all', 'clicks'],
  linkClicks: ['link_clicks', 'clicks_link', 'unique_link_clicks'],
  ctrAll: ['ctr_all', 'ctr'],
  ctrLink: ['ctr_link_click_through_rate', 'ctr_destination', 'link_ctr'],
  cpc: ['cpc_cost_per_link_click', 'cpc_all', 'cpc'],
  lpv: ['landing_page_views', 'landing_page_view'],
  costPerLpv: ['cost_per_landing_page_view'],
  video3s: ['3_second_video_plays', 'video_plays_at_3_seconds', 'video_plays'],
  hookRate: ['hook_hold_rate', 'hook_rate', 'thumbstop_rate'],
  thruplays: ['thruplays', 'thruplay'],
  p25: ['video_plays_at_25', 'video_watches_at_25'],
  p50: ['video_plays_at_50', 'video_watches_at_50'],
  p75: ['video_plays_at_75', 'video_watches_at_75'],
  p100: ['video_plays_at_100', 'video_watches_at_100'],
  results: ['results', 'keputusan'],
  purchases: ['purchases', 'website_purchases'],
  revenue: [
    'purchases_conversion_value',
    'website_purchases_conversion_value',
    'conversion_value',
  ],
  roas: ['purchase_roas_return_on_ad_spend', 'purchase_roas', 'website_purchase_roas'],
  // Optional creative copy. Ads Manager names these differently depending on
  // the export preset, and older presets omit them entirely.
  headline: ['title', 'headline', 'ad_headline', 'tajuk'],
  bodyCopy: ['body', 'primary_text', 'ad_body', 'ad_creative_body', 'teks_utama'],
  landingUrl: ['link', 'website_url', 'destination_url', 'link_url', 'ad_link'],
};

export function parseFbAdsCsv(text: string): IngestResult<NormalizedAdMetric> {
  const { rows, warnings } = parseCsv(text);
  const items: NormalizedAdMetric[] = [];
  let skipped = 0;

  if (rows.length === 0) {
    return { items, warnings: [...warnings, 'Fail kosong atau tiada baris data.'], skipped: 0 };
  }
  if (!hasAnyColumn(rows, A.adName)) {
    return {
      items,
      warnings: [
        ...warnings,
        'Tiada lajur "Ad name". Pastikan eksport Ads Manager termasuk nama iklan.',
      ],
      skipped: rows.length,
    };
  }

  const hasDailyBreakdown = hasAnyColumn(rows, A.day);
  if (!hasDailyBreakdown && !hasAnyColumn(rows, [...A.start, ...A.stop])) {
    warnings.push(
      'Tiada lajur tarikh — semua baris dianggap satu tempoh tunggal, jadi graf harian tidak akan ada.',
    );
  }

  for (const row of rows) {
    const adName = pick(row, A.adName)?.trim();
    if (!adName) {
      skipped += 1;
      continue;
    }

    const day = toDate(pick(row, A.day));
    const start = day ?? toDate(pick(row, A.start));
    const stop = day ?? toDate(pick(row, A.stop)) ?? start;
    if (!start || !stop) {
      skipped += 1;
      continue;
    }

    const spend = toNumber(pick(row, A.spend)) ?? 0;
    const impressions = toInt(pick(row, A.impressions)) ?? 0;

    // Ads Manager lets you export a rate without the count behind it. Where the
    // count is missing we rebuild it, so the funnel stays complete either way.
    const clicksAll =
      toInt(pick(row, A.clicksAll)) ??
      fromRate(toRate(pick(row, A.ctrAll), 'percent'), impressions) ??
      0;

    const linkClicks =
      toInt(pick(row, A.linkClicks)) ??
      fromRate(toRate(pick(row, A.ctrLink), 'percent'), impressions) ??
      fromCost(spend, toNumber(pick(row, A.cpc))) ??
      0;

    const lpv =
      toInt(pick(row, A.lpv)) ?? fromCost(spend, toNumber(pick(row, A.costPerLpv))) ?? 0;

    const video3s =
      toInt(pick(row, A.video3s)) ??
      fromRate(toRate(pick(row, A.hookRate), 'auto'), impressions) ??
      0;

    const revenue =
      toNumber(pick(row, A.revenue)) ??
      multiply(toNumber(pick(row, A.roas)), spend) ??
      0;

    items.push({
      ad_name: adName,
      adset_name: pick(row, A.adsetName)?.trim() ?? null,
      platform_campaign: pick(row, A.campaignName)?.trim() ?? null,
      external_ad_id: pick(row, A.adId)?.trim() ?? null,
      headline: pick(row, A.headline)?.trim() ?? null,
      body_copy: pick(row, A.bodyCopy)?.trim() ?? null,
      landing_url: pick(row, A.landingUrl)?.trim() ?? null,
      date_start: start,
      date_stop: stop < start ? start : stop,
      spend,
      impressions,
      reach: toInt(pick(row, A.reach)) ?? 0,
      frequency: toNumber(pick(row, A.frequency)),
      clicks_all: clicksAll,
      link_clicks: linkClicks,
      landing_page_views: lpv,
      video_3s_views: video3s,
      video_thruplays: toInt(pick(row, A.thruplays)) ?? 0,
      video_p25: toInt(pick(row, A.p25)) ?? 0,
      video_p50: toInt(pick(row, A.p50)) ?? 0,
      video_p75: toInt(pick(row, A.p75)) ?? 0,
      video_p100: toInt(pick(row, A.p100)) ?? 0,
      results: toInt(pick(row, A.results)) ?? 0,
      platform_purchases: toInt(pick(row, A.purchases)) ?? 0,
      platform_revenue: revenue,
      raw: null,
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} baris dilangkau kerana tiada nama iklan atau tarikh yang sah.`);
  }
  if (hasDailyBreakdown) {
    warnings.push('Eksport harian dikesan — graf trend akan tersedia untuk tempoh ini.');
  }
  if (!hasAnyColumn(rows, [...A.headline, ...A.bodyCopy, ...A.landingUrl])) {
    warnings.push(
      'Tiada lajur Title, Body atau Link — laporan Headlines, Body Copy dan Landing Pages akan kosong. Tambah lajur itu dalam eksport Ads Manager untuk mengaktifkannya.',
    );
  }

  return { items, warnings, skipped };
}

function fromRate(rate: number | null, base: number): number | null {
  if (rate === null || base <= 0) return null;
  return Math.round(rate * base);
}

function fromCost(spend: number, unitCost: number | null): number | null {
  if (unitCost === null || unitCost <= 0 || spend <= 0) return null;
  return Math.round(spend / unitCost);
}

function multiply(a: number | null, b: number): number | null {
  if (a === null) return null;
  return a * b;
}
