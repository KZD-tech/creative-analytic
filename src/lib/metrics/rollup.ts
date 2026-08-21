import type { Benchmarks, PerformanceRow, Tag } from '@/types/db';
import { deriveCreative, type CreativeMetrics } from './derive';

/**
 * A row in a report. Every report renders the same shape, whether it is one
 * card per creative or one card per landing page, so the card, table and chart
 * components never need to know which report they are showing.
 */
export interface ReportRow extends CreativeMetrics {
  rowKey: string;
  title: string;
  subtitle: string | null;
  /** How many creatives were folded into this row. 1 for creative-level rows. */
  memberCount: number;
  /** The creative whose thumbnail represents the row, and where it links to. */
  sampleCreativeId: string;
}

const ZERO_SUMS = {
  spend: 0, impressions: 0, reach: 0, clicks_all: 0, link_clicks: 0,
  landing_page_views: 0, video_3s_views: 0, video_thruplays: 0,
  video_p25: 0, video_p50: 0, video_p75: 0, video_p100: 0,
  results: 0, platform_revenue: 0, conversions: 0, revenue: 0, active_days: 0,
};

/**
 * Sums the raw counts, then derives the rates from those sums — never averages
 * per-creative rates, which would let an ad with 200 impressions outweigh one
 * with 200,000.
 */
function foldRows(members: PerformanceRow[], benchmarks: Benchmarks): CreativeMetrics {
  const head = members[0];
  const totals = { ...ZERO_SUMS };
  let maxReach = 0;

  for (const row of members) {
    totals.spend += row.spend;
    totals.impressions += row.impressions;
    totals.clicks_all += row.clicks_all;
    totals.link_clicks += row.link_clicks;
    totals.landing_page_views += row.landing_page_views;
    totals.video_3s_views += row.video_3s_views;
    totals.video_thruplays += row.video_thruplays;
    totals.video_p25 += row.video_p25;
    totals.video_p50 += row.video_p50;
    totals.video_p75 += row.video_p75;
    totals.video_p100 += row.video_p100;
    totals.results += row.results;
    totals.platform_revenue += row.platform_revenue;
    totals.conversions += row.conversions;
    totals.revenue += row.revenue;
    totals.active_days = Math.max(totals.active_days, row.active_days);
    maxReach = Math.max(maxReach, row.reach);
  }

  // Reach cannot be summed across ads — the same person may see several — so
  // the best available figure is the largest single reach in the group.
  return deriveCreative(
    { ...head, ...totals, reach: maxReach, frequency: maxReach > 0 ? totals.impressions / maxReach : null },
    benchmarks,
  );
}

export interface RollupOptions {
  /** null means "do not fold this row into a group" — it is dropped. */
  keyOf: (row: PerformanceRow) => string | null;
  titleOf: (row: PerformanceRow, key: string) => string;
  subtitleOf?: (row: PerformanceRow, members: PerformanceRow[]) => string | null;
}

export function rollup(
  rows: PerformanceRow[],
  benchmarks: Benchmarks,
  options: RollupOptions,
): ReportRow[] {
  const buckets = new Map<string, PerformanceRow[]>();

  for (const row of rows) {
    const key = options.keyOf(row);
    if (key === null) continue;
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()].map(([key, members]) => {
    const folded = foldRows(members, benchmarks);
    return {
      ...folded,
      rowKey: key,
      title: options.titleOf(members[0], key),
      subtitle: options.subtitleOf?.(members[0], members) ?? null,
      memberCount: members.length,
      sampleCreativeId: members[0].creative_id,
    };
  });
}

/** One row per creative — the shape every other report folds down from. */
export function perCreative(rows: PerformanceRow[], benchmarks: Benchmarks): ReportRow[] {
  return rows.map((row) => ({
    ...deriveCreative(row, benchmarks),
    rowKey: row.creative_id,
    title: row.ad_name,
    subtitle: row.adset_name,
    memberCount: 1,
    sampleCreativeId: row.creative_id,
  }));
}

export type GroupId = 'none' | 'adset' | 'media' | 'status' | `tag:${string}`;

export interface GroupedRows {
  key: string;
  label: string;
  rows: ReportRow[];
}

const MEDIA_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  video: 'Video',
  image: 'Imej',
  none: 'Tiada media',
};

const STATUS_LABELS: Record<string, string> = {
  winner: 'Winner',
  promising: 'Berpotensi',
  weak: 'Lemah',
  losing: 'Rugi',
  learning: 'Belum cukup data',
};

/** The second axis: how the report's rows are sectioned on screen. */
export function groupRows(
  rows: ReportRow[],
  group: GroupId,
  tagsByCreative: Record<string, Tag[]>,
): GroupedRows[] {
  if (group === 'none') return [{ key: 'all', label: '', rows }];

  const buckets = new Map<string, GroupedRows>();
  const push = (key: string, label: string, row: ReportRow) => {
    const bucket = buckets.get(key) ?? { key, label, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  };

  for (const row of rows) {
    if (group === 'adset') {
      push(row.adset_name ?? '—', row.adset_name ?? 'Tiada ad set', row);
    } else if (group === 'media') {
      push(row.media_kind, MEDIA_LABELS[row.media_kind] ?? row.media_kind, row);
    } else if (group === 'status') {
      push(row.status, STATUS_LABELS[row.status] ?? row.status, row);
    } else {
      const dimension = group.slice(4);
      const tags = (tagsByCreative[row.sampleCreativeId] ?? []).filter((t) => t.dimension === dimension);
      if (tags.length === 0) push('__untagged__', 'Tiada tag', row);
      else for (const tag of tags) push(tag.id, tag.label, row);
    }
  }

  return [...buckets.values()].sort((a, z) => {
    // "no value" buckets are a gap in the data, not a finding — keep them last.
    if (a.key === '__untagged__' || a.key === '—') return 1;
    if (z.key === '__untagged__' || z.key === '—') return -1;
    const spendA = a.rows.reduce((t, r) => t + r.spend, 0);
    const spendZ = z.rows.reduce((t, r) => t + r.spend, 0);
    return spendZ - spendA;
  });
}
