/**
 * The seam between "where numbers came from" and "how they are stored".
 *
 * CSV upload and the Meta Marketing API both produce these shapes, so adding
 * the API later means writing one more producer — the writer, the metrics
 * engine and the whole UI stay untouched.
 */

export interface NormalizedAdMetric {
  ad_name: string;
  adset_name: string | null;
  platform_campaign: string | null;
  external_ad_id: string | null;
  headline: string | null;
  body_copy: string | null;
  landing_url: string | null;
  date_start: string;
  date_stop: string;
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
  platform_purchases: number;
  platform_revenue: number;
  raw: Record<string, unknown> | null;
}

export interface NormalizedConversion {
  external_id: string | null;
  occurred_at: string;
  amount: number;
  channel: string | null;
  attribution_raw: string | null;
  /** Ad name lifted out of the attribution string, before matching. */
  ad_name_hint: string | null;
}

export interface NormalizedMediaLink {
  ad_name: string;
  media_url: string;
}

export interface IngestResult<T> {
  items: T[];
  warnings: string[];
  skipped: number;
}

export type MetricSource = 'csv' | 'meta_api' | 'google_ads';
