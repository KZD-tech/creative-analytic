import type { Benchmarks } from '@/types/db';

export const DEFAULT_BENCHMARKS: Omit<Benchmarks, 'campaign_id'> = {
  hook_rate_good: 0.2,
  hook_rate_ok: 0.15,
  hold_rate_good: 0.05,
  hold_rate_ok: 0.03,
  ctr_good: 0.03,
  ctr_ok: 0.02,
  lpv_rate_good: 0.6,
  lpv_rate_ok: 0.4,
  cvr_good: 0.1,
  cvr_ok: 0.05,
  roas_good: 1.0,
  roas_ok: 0.5,
  min_spend: 50,
};

export function withDefaults(
  campaignId: string,
  partial: Partial<Benchmarks> | null | undefined,
): Benchmarks {
  return { campaign_id: campaignId, ...DEFAULT_BENCHMARKS, ...(partial ?? {}) };
}

/** Four-way grade used for every funnel stage and money metric. */
export type Grade = 'good' | 'ok' | 'weak' | 'none';

export function grade(value: number | null, good: number, ok: number): Grade {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'none';
  if (value >= good) return 'good';
  if (value >= ok) return 'ok';
  return 'weak';
}
