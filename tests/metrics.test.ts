import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCreative, ratio } from '@/lib/metrics/derive';
import { withDefaults, grade } from '@/lib/metrics/benchmarks';
import { diagnose, leakSummary } from '@/lib/metrics/diagnose';
import { breakdownByDimension } from '@/lib/metrics/breakdown';
import { highlightRules, isHighlighted, METRICS } from '@/lib/metrics/catalog';
import type { PerformanceRow, Tag } from '@/types/db';

const B = withDefaults('demo', null);

function row(patch: Partial<PerformanceRow> = {}): PerformanceRow {
  return {
    creative_id: 'c1',
    ad_name: 'V1H1',
    adset_name: null,
    platform_campaign: null,
    media_url: null,
    media_kind: 'none',
    thumbnail_url: null,
    external_ad_id: null,
    headline: null,
    body_copy: null,
    landing_url: null,
    landing_key: null,
    first_seen: null,
    last_seen: null,
    spend: 1000,
    impressions: 100_000,
    reach: 50_000,
    frequency: 2,
    clicks_all: 4000,
    link_clicks: 3000,
    landing_page_views: 2000,
    video_3s_views: 25_000,
    video_thruplays: 6000,
    video_p25: 20_000,
    video_p50: 12_000,
    video_p75: 8000,
    video_p100: 5000,
    results: 200,
    platform_revenue: 0,
    conversions: 250,
    revenue: 2000,
    active_days: 7,
    ...patch,
  };
}

test('ratio never returns NaN or Infinity', () => {
  assert.equal(ratio(1, 0), null);
  assert.equal(ratio(0, 0), null);
  assert.equal(ratio(1, -1), null);
  assert.equal(ratio(3, 4), 0.75);
});

test('grade sorts values against their benchmark pair', () => {
  assert.equal(grade(0.25, 0.2, 0.15), 'good');
  assert.equal(grade(0.17, 0.2, 0.15), 'ok');
  assert.equal(grade(0.05, 0.2, 0.15), 'weak');
  assert.equal(grade(null, 0.2, 0.15), 'none');
  assert.equal(grade(0, 0.2, 0.15), 'none');
});

test('derived rates use the right denominator at each funnel stage', () => {
  const m = deriveCreative(row(), B);
  assert.equal(m.hookRate, 0.25); // 3s plays / impressions
  assert.equal(m.holdRate, 0.06); // thruplays / impressions
  assert.equal(m.ctr, 0.03); // link clicks / impressions
  assert.equal(m.lpvRate, 2000 / 3000); // LPV / link clicks, NOT / impressions
  assert.equal(m.cvr, 0.125); // conversions / LPV
  assert.equal(m.roas, 2);
  assert.equal(m.cpa, 4);
  assert.equal(m.aov, 8);
  assert.equal(m.cpm, 10);
  assert.equal(m.profit, 1000);
  assert.equal(m.status, 'winner');
});

test('a creative below the spend threshold is never judged', () => {
  const m = deriveCreative(row({ spend: 10, revenue: 0, conversions: 0 }), B);
  assert.equal(m.status, 'learning');
  const verdict = diagnose(m, B);
  assert.equal(verdict.stage, null);
  assert.equal(verdict.severity, 'info');
  assert.match(verdict.headline, /Belum cukup data/);
});

test('diagnosis names the earliest leaking stage, not the worst one', () => {
  // Hook is weak AND conversion is weak; the fix that matters is the hook,
  // because everything downstream is starved by it.
  const m = deriveCreative(
    row({ video_3s_views: 5000, landing_page_views: 2000, conversions: 10, revenue: 100 }),
    B,
  );
  const verdict = diagnose(m, B);
  assert.equal(verdict.stage?.key, 'hook');
  assert.match(verdict.headline, /Hook/);
  assert.equal(verdict.severity, 'critical');
});

test('a healthy funnel reports no leak', () => {
  const verdict = diagnose(deriveCreative(row(), B), B);
  assert.equal(verdict.stage, null);
  assert.equal(verdict.severity, 'none');
  assert.match(verdict.headline, /Sihat/);
});

test('leakSummary weights stages by spend, biggest first', () => {
  const weakHook = deriveCreative(
    row({ creative_id: 'a', spend: 5000, video_3s_views: 2000, revenue: 100 }),
    B,
  );
  const weakConvert = deriveCreative(
    row({ creative_id: 'b', spend: 800, conversions: 10, revenue: 40 }),
    B,
  );
  const healthy = deriveCreative(row({ creative_id: 'c' }), B);

  const summary = leakSummary([weakConvert, healthy, weakHook], B);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].stage, 'hook');
  assert.equal(summary[0].spend, 5000);
  assert.equal(summary[1].stage, 'convert');
});

test('tag breakdown recomputes rates from summed counts, not averaged rates', () => {
  const big = deriveCreative(
    row({ creative_id: 'big', impressions: 200_000, link_clicks: 2000, spend: 900, revenue: 900 }),
    B,
  );
  const tiny = deriveCreative(
    row({ creative_id: 'tiny', impressions: 200, link_clicks: 100, spend: 100, revenue: 300 }),
    B,
  );

  const tag: Tag = {
    id: 't1',
    campaign_id: 'demo',
    dimension: 'hook',
    label: 'Soalan',
    created_at: '',
  };
  const rows = breakdownByDimension([big, tiny], { big: [tag], tiny: [tag] }, 'hook');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].creatives, 2);
  assert.equal(rows[0].spend, 1000);
  assert.equal(rows[0].revenue, 1200);
  assert.equal(rows[0].roas, 1.2);
  // Summed: 2100 clicks / 200 200 impressions ≈ 1.05%. Averaging the two
  // creatives' CTRs would have given ~25.5%.
  assert.ok(rows[0].ctr !== null && rows[0].ctr < 0.02);
});

test('untagged creatives are bucketed separately and sink to the bottom', () => {
  const tagged = deriveCreative(row({ creative_id: 'a', spend: 10 }), B);
  const untagged = deriveCreative(row({ creative_id: 'b', spend: 9000 }), B);
  const tag: Tag = { id: 't1', campaign_id: 'demo', dimension: 'hook', label: 'Soalan', created_at: '' };

  const rows = breakdownByDimension([tagged, untagged], { a: [tag] }, 'hook');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, 'Soalan');
  assert.equal(rows[1].label, 'Tiada tag');
  assert.equal(rows[1].spend, 9000);
});

test('a relative highlight that would flag every row is dropped', () => {
  // Three creatives, all with exactly one conversion: "top quartile" is
  // meaningless here, so nothing should be highlighted.
  const tied = ['a', 'b', 'c'].map((id) =>
    deriveCreative(row({ creative_id: id, conversions: 1, revenue: 100 }), B),
  );
  const rules = highlightRules(tied, ['conversions'], B);
  assert.equal(rules.conversions.kind, 'none');
  assert.equal(isHighlighted(METRICS.conversions, tied[0], rules.conversions), false);
});

test('a relative highlight survives when rows actually differ', () => {
  const spread = [10, 5, 3, 1].map((n, i) =>
    deriveCreative(row({ creative_id: `c${i}`, conversions: n, revenue: 100 }), B),
  );
  const rules = highlightRules(spread, ['conversions'], B);
  assert.equal(rules.conversions.kind, 'quartile');
  assert.equal(isHighlighted(METRICS.conversions, spread[0], rules.conversions), true);
  assert.equal(isHighlighted(METRICS.conversions, spread[3], rules.conversions), false);
});

test('benchmark highlights stay absolute even when every row clears them', () => {
  // All three beat the ROAS benchmark. That is a real result, not a tie, so it
  // must keep showing — unlike the relative rule above.
  const winners = ['a', 'b', 'c'].map((id) =>
    deriveCreative(row({ creative_id: id, spend: 100, revenue: 500 }), B),
  );
  const rules = highlightRules(winners, ['roas'], B);
  assert.equal(rules.roas.kind, 'benchmark');
  assert.ok(winners.every((w) => isHighlighted(METRICS.roas, w, rules.roas)));
});

test('spend and impressions are never highlighted', () => {
  const rows = [1, 2, 3, 4].map((n) => deriveCreative(row({ creative_id: `c${n}`, spend: n * 100 }), B));
  const rules = highlightRules(rows, ['spend', 'impressions'], B);
  assert.equal(rules.spend.kind, 'none');
  assert.equal(rules.impressions.kind, 'none');
});
