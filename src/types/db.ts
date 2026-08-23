export type ConversionSource = 'csv' | 'meta_api' | 'google_ads' | 'manual' | 'api';

export type TagDimension = 'hook' | 'format' | 'angle' | 'offer' | 'persona' | 'cta' | 'custom';

export const TAG_DIMENSIONS: TagDimension[] = [
  'hook',
  'format',
  'angle',
  'offer',
  'persona',
  'cta',
  'custom',
];

export const TAG_DIMENSION_LABELS: Record<TagDimension, string> = {
  hook: 'Hook',
  format: 'Format',
  angle: 'Angle',
  offer: 'Offer',
  persona: 'Persona',
  cta: 'CTA',
  custom: 'Lain-lain',
};

export type MediaKind = 'none' | 'youtube' | 'video' | 'image';

export interface Campaign {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  objective: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Creative {
  id: string;
  campaign_id: string;
  ad_name: string;
  ad_name_key: string;
  adset_name: string | null;
  platform_campaign: string | null;
  external_ad_id: string | null;
  media_url: string | null;
  media_kind: MediaKind;
  thumbnail_url: string | null;
  preview_url: string | null;
  headline: string | null;
  body_copy: string | null;
  landing_url: string | null;
  landing_key: string | null;
  notes: string | null;
  first_seen: string | null;
  last_seen: string | null;
}

export interface Tag {
  id: string;
  campaign_id: string | null;
  dimension: TagDimension;
  label: string;
  created_at: string;
}

/** Raw shape returned by creative.creative_performance() */
export interface PerformanceRow {
  creative_id: string;
  ad_name: string;
  adset_name: string | null;
  platform_campaign: string | null;
  media_url: string | null;
  media_kind: MediaKind;
  thumbnail_url: string | null;
  preview_url: string | null;
  external_ad_id: string | null;
  headline: string | null;
  body_copy: string | null;
  landing_url: string | null;
  landing_key: string | null;
  first_seen: string | null;
  last_seen: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  video_3s_views: number;
  video_thruplays: number;
  video_p25: number;
  video_p50: number;
  video_p75: number;
  video_p100: number;
  results: number;
  platform_revenue: number;
  conversions: number;
  revenue: number;
  active_days: number;
}

/** Raw shape returned by creative.daily_series() */
export interface DailyRow {
  day: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  landing_page_views: number;
  video_3s_views: number;
  reach: number;
  conversions: number;
  revenue: number;
}

/** Raw shape returned by creative.creative_daily_series() */
export interface CreativeDailyRow {
  day: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  video_3s_views: number;
  video_thruplays: number;
  conversions: number;
  revenue: number;
}

export interface CampaignSummaryRow {
  spend: number;
  impressions: number;
  link_clicks: number;
  landing_page_views: number;
  video_3s_views: number;
  results: number;
  conversions: number;
  revenue: number;
  creative_count: number;
  first_day: string | null;
  last_day: string | null;
}

export interface Benchmarks {
  campaign_id: string;
  hook_rate_good: number;
  hook_rate_ok: number;
  hold_rate_good: number;
  hold_rate_ok: number;
  ctr_good: number;
  ctr_ok: number;
  lpv_rate_good: number;
  lpv_rate_ok: number;
  cvr_good: number;
  cvr_ok: number;
  roas_good: number;
  roas_ok: number;
  min_spend: number;
}

export type BatchKind =
  | 'fb_ads' | 'conversions' | 'media_links' | 'meta_api' | 'google_ads' | 'rollback';

export interface UploadBatch {
  id: string;
  campaign_id: string;
  kind: BatchKind;
  source: ConversionSource;
  filename: string | null;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  status: 'ok' | 'partial' | 'error' | 'rolled_back';
  message: string | null;
  warnings: string[];
  snapshot_rows: number;
  created_at: string;
}
