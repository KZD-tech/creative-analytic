import type { CampaignSummaryRow } from '@/types/db';
import { ratio } from './derive';

export interface SummaryMetrics {
  spend: number;
  revenue: number;
  roas: number | null;
  conversions: number;
  aov: number | null;
  cpa: number | null;
  cvr: number | null;
  ctr: number | null;
  hookRate: number | null;
  cpm: number | null;
  creativeCount: number;
  profit: number;
}

export function summarise(row: CampaignSummaryRow): SummaryMetrics {
  return {
    spend: row.spend,
    revenue: row.revenue,
    roas: ratio(row.revenue, row.spend),
    conversions: row.conversions,
    aov: ratio(row.revenue, row.conversions),
    cpa: ratio(row.spend, row.conversions),
    cvr: ratio(row.conversions, row.landing_page_views),
    ctr: ratio(row.link_clicks, row.impressions),
    hookRate: ratio(row.video_3s_views, row.impressions),
    cpm: ratio(row.spend * 1000, row.impressions),
    creativeCount: row.creative_count,
    profit: row.revenue - row.spend,
  };
}

/** Relative change, or null when the baseline is zero and a ratio would be meaningless. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
