import type { Benchmarks, PerformanceRow } from '@/types/db';
import { grade, type Grade } from './benchmarks';

/** Safe ratio: returns null rather than NaN/Infinity so the UI can render "—". */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

export type CreativeStatus = 'winner' | 'promising' | 'weak' | 'losing' | 'learning';

export const STATUS_LABELS: Record<CreativeStatus, string> = {
  winner: 'Winner',
  promising: 'Berpotensi',
  weak: 'Lemah',
  losing: 'Rugi',
  learning: 'Belum cukup data',
};

export interface FunnelStage {
  key: 'hook' | 'hold' | 'click' | 'landing' | 'convert';
  label: string;
  /** What the rate is a fraction of, spelled out for the UI. */
  basis: string;
  rate: number | null;
  count: number;
  grade: Grade;
  good: number;
  ok: number;
}

export interface CreativeMetrics extends PerformanceRow {
  hookRate: number | null;
  holdRate: number | null;
  retention: number | null;
  ctr: number | null;
  ctrAll: number | null;
  lpvRate: number | null;
  cvr: number | null;
  hookToClick: number | null;
  cpm: number | null;
  cpc: number | null;
  costPerLpv: number | null;
  cpa: number | null;
  aov: number | null;
  roas: number | null;
  profit: number;
  status: CreativeStatus;
  funnel: FunnelStage[];
}

export function deriveCreative(row: PerformanceRow, b: Benchmarks): CreativeMetrics {
  const hookRate = ratio(row.video_3s_views, row.impressions);
  const holdRate = ratio(row.video_thruplays, row.impressions);
  const retention = ratio(row.video_p100, row.video_p25);
  const ctr = ratio(row.link_clicks, row.impressions);
  const ctrAll = ratio(row.clicks_all, row.impressions);
  const lpvRate = ratio(row.landing_page_views, row.link_clicks);
  const cvr = ratio(row.conversions, row.landing_page_views);
  const hookToClick = ratio(row.link_clicks, row.video_3s_views);

  const cpm = ratio(row.spend * 1000, row.impressions);
  const cpc = ratio(row.spend, row.link_clicks);
  const costPerLpv = ratio(row.spend, row.landing_page_views);
  const cpa = ratio(row.spend, row.conversions);
  const aov = ratio(row.revenue, row.conversions);
  const roas = ratio(row.revenue, row.spend);

  const funnel: FunnelStage[] = [
    {
      key: 'hook',
      label: 'Hook',
      basis: 'drpd impresi',
      rate: hookRate,
      count: row.video_3s_views,
      grade: grade(hookRate, b.hook_rate_good, b.hook_rate_ok),
      good: b.hook_rate_good,
      ok: b.hook_rate_ok,
    },
    {
      key: 'hold',
      label: 'Hold',
      basis: 'drpd impresi',
      rate: holdRate,
      count: row.video_thruplays,
      grade: grade(holdRate, b.hold_rate_good, b.hold_rate_ok),
      good: b.hold_rate_good,
      ok: b.hold_rate_ok,
    },
    {
      key: 'click',
      label: 'Klik',
      basis: 'drpd impresi',
      rate: ctr,
      count: row.link_clicks,
      grade: grade(ctr, b.ctr_good, b.ctr_ok),
      good: b.ctr_good,
      ok: b.ctr_ok,
    },
    {
      key: 'landing',
      label: 'Landing',
      basis: 'drpd klik',
      rate: lpvRate,
      count: row.landing_page_views,
      grade: grade(lpvRate, b.lpv_rate_good, b.lpv_rate_ok),
      good: b.lpv_rate_good,
      ok: b.lpv_rate_ok,
    },
    {
      key: 'convert',
      label: 'Derma',
      basis: 'drpd landing',
      rate: cvr,
      count: row.conversions,
      grade: grade(cvr, b.cvr_good, b.cvr_ok),
      good: b.cvr_good,
      ok: b.cvr_ok,
    },
  ];

  return {
    ...row,
    hookRate,
    holdRate,
    retention,
    ctr,
    ctrAll,
    lpvRate,
    cvr,
    hookToClick,
    cpm,
    cpc,
    costPerLpv,
    cpa,
    aov,
    roas,
    profit: row.revenue - row.spend,
    status: classify(row, roas, b),
    funnel,
  };
}

function classify(row: PerformanceRow, roas: number | null, b: Benchmarks): CreativeStatus {
  if (row.spend < b.min_spend) return 'learning';
  if (roas === null) return 'losing';
  if (roas >= b.roas_good) return 'winner';
  if (roas >= b.roas_ok) return 'promising';
  if (roas > 0) return 'weak';
  return 'losing';
}

export function deriveAll(rows: PerformanceRow[], b: Benchmarks): CreativeMetrics[] {
  return rows.map((row) => deriveCreative(row, b));
}
