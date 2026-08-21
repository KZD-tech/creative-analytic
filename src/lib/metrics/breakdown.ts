import type { CreativeMetrics } from './derive';
import { ratio } from './derive';
import type { Tag, TagDimension } from '@/types/db';

export interface BreakdownRow {
  key: string;
  label: string;
  creatives: number;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  video3s: number;
  linkClicks: number;
  landingPageViews: number;
  roas: number | null;
  cpa: number | null;
  aov: number | null;
  hookRate: number | null;
  ctr: number | null;
  cvr: number | null;
}

function blank(key: string, label: string): BreakdownRow {
  return {
    key,
    label,
    creatives: 0,
    spend: 0,
    revenue: 0,
    conversions: 0,
    impressions: 0,
    video3s: 0,
    linkClicks: 0,
    landingPageViews: 0,
    roas: null,
    cpa: null,
    aov: null,
    hookRate: null,
    ctr: null,
    cvr: null,
  };
}

function finalise(row: BreakdownRow): BreakdownRow {
  return {
    ...row,
    roas: ratio(row.revenue, row.spend),
    cpa: ratio(row.spend, row.conversions),
    aov: ratio(row.revenue, row.conversions),
    hookRate: ratio(row.video3s, row.impressions),
    ctr: ratio(row.linkClicks, row.impressions),
    cvr: ratio(row.conversions, row.landingPageViews),
  };
}

/**
 * Rates are recomputed from summed counts, never averaged from per-creative
 * rates — averaging rates would let a creative with 200 impressions outweigh
 * one with 200,000.
 */
export function breakdownByDimension(
  items: CreativeMetrics[],
  tagsByCreative: Map<string, Tag[]> | Record<string, Tag[]>,
  dimension: TagDimension,
): BreakdownRow[] {
  const lookup =
    tagsByCreative instanceof Map
      ? tagsByCreative
      : new Map(Object.entries(tagsByCreative));

  const buckets = new Map<string, BreakdownRow>();
  const UNTAGGED = '__untagged__';

  for (const item of items) {
    const tags = (lookup.get(item.creative_id) ?? []).filter((tag) => tag.dimension === dimension);
    const targets = tags.length > 0 ? tags.map((tag) => ({ key: tag.id, label: tag.label })) : [{ key: UNTAGGED, label: 'Tiada tag' }];

    for (const target of targets) {
      const row = buckets.get(target.key) ?? blank(target.key, target.label);
      row.creatives += 1;
      row.spend += item.spend;
      row.revenue += item.revenue;
      row.conversions += item.conversions;
      row.impressions += item.impressions;
      row.video3s += item.video_3s_views;
      row.linkClicks += item.link_clicks;
      row.landingPageViews += item.landing_page_views;
      buckets.set(target.key, row);
    }
  }

  return [...buckets.values()]
    .map(finalise)
    .sort((a, z) => {
      // Untagged always sinks to the bottom — it is a gap, not a finding.
      if (a.key === UNTAGGED) return 1;
      if (z.key === UNTAGGED) return -1;
      return z.spend - a.spend;
    });
}

/** Which tag dimensions actually have assignments, so the UI shows only useful tabs. */
export function usedDimensions(
  tagsByCreative: Map<string, Tag[]> | Record<string, Tag[]>,
): TagDimension[] {
  const lookup =
    tagsByCreative instanceof Map ? tagsByCreative : new Map(Object.entries(tagsByCreative));
  const used = new Set<TagDimension>();
  for (const tags of lookup.values()) for (const tag of tags) used.add(tag.dimension);
  return [...used];
}
