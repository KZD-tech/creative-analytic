import type { Benchmarks } from '@/types/db';
import type { CreativeMetrics } from './derive';
import { compact, money, multiple, num, pct } from '@/lib/format';

export type MetricId =
  | 'roas' | 'spend' | 'revenue' | 'conversions' | 'cpa' | 'aov' | 'profit'
  | 'impressions' | 'reach' | 'frequency' | 'cpm' | 'cpc'
  | 'hookRate' | 'holdRate' | 'retention' | 'ctr' | 'lpv' | 'lpvRate' | 'cvr';

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Whether a bigger number is better, smaller is better, or neither. */
  direction: 'high' | 'low' | 'none';
  value: (m: CreativeMetrics) => number | null;
  format: (m: CreativeMetrics, currency: string) => string;
  /** The campaign's own "good" threshold, when the metric has one. */
  benchmark?: (b: Benchmarks) => number;
}

export const METRICS: Record<MetricId, MetricDef> = {
  roas: {
    id: 'roas', label: 'ROAS', direction: 'high',
    value: (m) => m.roas, format: (m) => multiple(m.roas),
    benchmark: (b) => b.roas_good,
  },
  spend: {
    id: 'spend', label: 'Belanja', direction: 'none',
    value: (m) => m.spend, format: (m, c) => money(m.spend, c),
  },
  revenue: {
    id: 'revenue', label: 'Hasil', direction: 'high',
    value: (m) => m.revenue, format: (m, c) => money(m.revenue, c),
  },
  conversions: {
    id: 'conversions', label: 'Derma', direction: 'high',
    value: (m) => m.conversions, format: (m) => num(m.conversions),
  },
  cpa: {
    id: 'cpa', label: 'CPA', direction: 'low',
    value: (m) => m.cpa, format: (m, c) => money(m.cpa, c, 2),
  },
  aov: {
    id: 'aov', label: 'Purata derma', direction: 'high',
    value: (m) => m.aov, format: (m, c) => money(m.aov, c),
  },
  profit: {
    id: 'profit', label: 'Untung/rugi', direction: 'high',
    value: (m) => m.profit, format: (m, c) => money(m.profit, c),
  },
  impressions: {
    id: 'impressions', label: 'Impresi', direction: 'none',
    value: (m) => m.impressions, format: (m) => compact(m.impressions),
  },
  reach: {
    id: 'reach', label: 'Jangkauan', direction: 'none',
    value: (m) => m.reach, format: (m) => compact(m.reach),
  },
  frequency: {
    id: 'frequency', label: 'Frekuensi', direction: 'low',
    value: (m) => m.frequency,
    format: (m) => (m.frequency ? `${m.frequency.toFixed(2)}x` : '—'),
  },
  cpm: {
    id: 'cpm', label: 'CPM', direction: 'low',
    value: (m) => m.cpm, format: (m, c) => money(m.cpm, c, 2),
  },
  cpc: {
    id: 'cpc', label: 'CPC', direction: 'low',
    value: (m) => m.cpc, format: (m, c) => money(m.cpc, c, 2),
  },
  hookRate: {
    id: 'hookRate', label: 'Hook rate', direction: 'high',
    value: (m) => m.hookRate, format: (m) => pct(m.hookRate),
    benchmark: (b) => b.hook_rate_good,
  },
  holdRate: {
    id: 'holdRate', label: 'Hold rate', direction: 'high',
    value: (m) => m.holdRate, format: (m) => pct(m.holdRate),
    benchmark: (b) => b.hold_rate_good,
  },
  retention: {
    id: 'retention', label: 'Tamat tonton', direction: 'high',
    value: (m) => m.retention, format: (m) => pct(m.retention),
  },
  ctr: {
    id: 'ctr', label: 'CTR', direction: 'high',
    value: (m) => m.ctr, format: (m) => pct(m.ctr, 2),
    benchmark: (b) => b.ctr_good,
  },
  lpv: {
    id: 'lpv', label: 'LPV', direction: 'high',
    value: (m) => m.landing_page_views, format: (m) => num(m.landing_page_views),
  },
  lpvRate: {
    id: 'lpvRate', label: 'Kadar LPV', direction: 'high',
    value: (m) => m.lpvRate, format: (m) => pct(m.lpvRate),
    benchmark: (b) => b.lpv_rate_good,
  },
  cvr: {
    id: 'cvr', label: 'CVR', direction: 'high',
    value: (m) => m.cvr, format: (m) => pct(m.cvr),
    benchmark: (b) => b.cvr_good,
  },
};

export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

export const DEFAULT_METRICS: MetricId[] = ['roas', 'spend', 'cpa', 'conversions'];
export const MAX_METRICS = 8;

/**
 * Which values get the green pill.
 *
 * Two rules, in order, because the honest answer differs by metric:
 *  1. If the campaign defines a benchmark for it (ROAS, CTR, CVR, hook…), the
 *     value is good when it clears that benchmark. Absolute, and the same
 *     answer no matter what else is on screen.
 *  2. Otherwise (spend, CPA, purchases…) there is no universal "good", so the
 *     value is highlighted when it sits in the best quartile of the rows
 *     currently shown — relative, and it says so in the UI.
 *
 * Metrics with no direction (spend, impressions) are never highlighted: a big
 * number there is a fact, not an achievement.
 */
export interface HighlightRule {
  kind: 'benchmark' | 'quartile' | 'none';
  threshold: number | null;
}

export function highlightRules(
  rows: CreativeMetrics[],
  metrics: MetricId[],
  benchmarks: Benchmarks,
): Record<string, HighlightRule> {
  const rules: Record<string, HighlightRule> = {};

  // A creative below the spend threshold is not being judged, so it must not
  // take part in judging others either. One donation on RM2 of spend reads as
  // 1,147x, and letting that set the top quartile pushes the bar so high that
  // genuinely strong creatives stop being highlighted at all.
  const judged = rows.filter((row) => row.status !== 'learning');
  const pool = judged.length > 0 ? judged : rows;

  for (const id of metrics) {
    const def = METRICS[id];

    if (def.benchmark) {
      rules[id] = { kind: 'benchmark', threshold: def.benchmark(benchmarks) };
      continue;
    }
    if (def.direction === 'none') {
      rules[id] = { kind: 'none', threshold: null };
      continue;
    }

    const values = pool
      .map((row) => def.value(row))
      .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
      .sort((a, z) => (def.direction === 'high' ? z - a : a - z));

    // Too few rows for a quartile to mean anything; only the best stands out.
    const threshold = values.length < 4 ? (values[0] ?? null) : values[Math.floor(values.length / 4)];

    // A relative rule that flags every row says nothing — it happens when the
    // values tie, or when there are so few rows that the "top quartile" is all
    // of them. Better to highlight none than to make every row look special.
    const passing = values.filter((v) =>
      def.direction === 'low' ? v <= (threshold ?? 0) : v >= (threshold ?? 0),
    ).length;

    rules[id] =
      threshold === null || (values.length > 1 && passing === values.length)
        ? { kind: 'none', threshold: null }
        : { kind: 'quartile', threshold };
  }

  return rules;
}

export function isHighlighted(
  metric: MetricDef,
  row: CreativeMetrics,
  rule: HighlightRule | undefined,
): boolean {
  // Green says "this one is doing well". A creative with too little spend to
  // judge cannot have earned that, whatever its ratios happen to say.
  if (row.status === 'learning') return false;

  if (!rule || rule.kind === 'none' || rule.threshold === null) return false;
  const value = metric.value(row);
  if (value === null || !Number.isFinite(value) || value <= 0) return false;
  return metric.direction === 'low' ? value <= rule.threshold : value >= rule.threshold;
}

/**
 * Whether a value should be shown muted rather than as a finding.
 *
 * A creative below the spend threshold still has real counts — it genuinely
 * received those donations — but its *ratios* are arithmetic on a denominator
 * too small to mean anything. Showing "1147.78x" in the same weight as a
 * hard-won 7x invites exactly the wrong conclusion, so the derived figures are
 * dimmed while the raw counts stay legible.
 */
export function isUnreliable(metric: MetricDef, row: CreativeMetrics): boolean {
  return row.status === 'learning' && metric.direction !== 'none';
}
