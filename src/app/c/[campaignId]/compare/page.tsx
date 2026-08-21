import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { getBenchmarks, getCampaign, getPerformance } from '@/lib/db/queries';
import { deriveAll, type CreativeMetrics } from '@/lib/metrics/derive';
import { diagnose } from '@/lib/metrics/diagnose';
import { resolveWindow } from '@/lib/window';
import { compact, money, multiple, num, pct } from '@/lib/format';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { Card, EmptyState } from '@/components/ui/primitives';
import { MediaThumb } from '@/components/creatives/MediaThumb';
import { Funnel } from '@/components/creatives/Funnel';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

type Direction = 'high' | 'low';

interface Metric {
  label: string;
  direction: Direction | null;
  value: (m: CreativeMetrics) => number | null;
  format: (m: CreativeMetrics, currency: string) => string;
}

const METRICS: Metric[] = [
  { label: 'Belanja', direction: null, value: (m) => m.spend, format: (m, c) => money(m.spend, c) },
  { label: 'Impresi', direction: null, value: (m) => m.impressions, format: (m) => compact(m.impressions) },
  { label: 'Frekuensi', direction: 'low', value: (m) => m.frequency, format: (m) => (m.frequency ? `${m.frequency.toFixed(2)}x` : '—') },
  { label: 'CPM', direction: 'low', value: (m) => m.cpm, format: (m, c) => money(m.cpm, c, 2) },
  { label: 'Hook rate', direction: 'high', value: (m) => m.hookRate, format: (m) => pct(m.hookRate) },
  { label: 'Hold rate', direction: 'high', value: (m) => m.holdRate, format: (m) => pct(m.holdRate) },
  { label: 'CTR (link)', direction: 'high', value: (m) => m.ctr, format: (m) => pct(m.ctr, 2) },
  { label: 'CPC', direction: 'low', value: (m) => m.cpc, format: (m, c) => money(m.cpc, c, 2) },
  { label: 'LPV', direction: 'high', value: (m) => m.landing_page_views, format: (m) => num(m.landing_page_views) },
  { label: 'Kadar LPV', direction: 'high', value: (m) => m.lpvRate, format: (m) => pct(m.lpvRate) },
  { label: 'Kos / LPV', direction: 'low', value: (m) => m.costPerLpv, format: (m, c) => money(m.costPerLpv, c, 2) },
  { label: 'Derma', direction: 'high', value: (m) => m.conversions, format: (m) => num(m.conversions) },
  { label: 'CVR', direction: 'high', value: (m) => m.cvr, format: (m) => pct(m.cvr) },
  { label: 'CPA', direction: 'low', value: (m) => m.cpa, format: (m, c) => money(m.cpa, c) },
  { label: 'Purata derma', direction: 'high', value: (m) => m.aov, format: (m, c) => money(m.aov, c) },
  { label: 'Hasil', direction: 'high', value: (m) => m.revenue, format: (m, c) => money(m.revenue, c) },
  { label: 'ROAS', direction: 'high', value: (m) => m.roas, format: (m) => multiple(m.roas) },
];

function bestIndex(items: CreativeMetrics[], metric: Metric): number | null {
  if (!metric.direction) return null;
  let best: number | null = null;
  let bestValue: number | null = null;

  items.forEach((item, index) => {
    const value = metric.value(item);
    if (value === null || !Number.isFinite(value) || value <= 0) return;
    if (bestValue === null || (metric.direction === 'high' ? value > bestValue : value < bestValue)) {
      bestValue = value;
      best = index;
    }
  });

  return best;
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaignId } = await params;
  const query = await searchParams;
  const window = resolveWindow(
    typeof query.range === 'string' ? query.range : undefined,
    typeof query.from === 'string' ? query.from : undefined,
    typeof query.to === 'string' ? query.to : undefined,
  );

  const ids = String(query.ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 4);

  const loaded = await load(async () => {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return null;

    const [performance, benchmarks] = await Promise.all([
      getPerformance(campaignId, window),
      getBenchmarks(campaignId),
    ]);
    return { campaign, performance, benchmarks };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { campaign, performance, benchmarks } = loaded.data;
  const all = deriveAll(performance, benchmarks);
  const items = ids
    .map((id) => all.find((item) => item.creative_id === id))
    .filter((item): item is CreativeMetrics => Boolean(item));

  if (items.length < 2) {
    return (
      <EmptyState
        title="Pilih 2 hingga 4 kreatif untuk dibandingkan"
        action={
          <Link
            href={`/c/${encodeURIComponent(campaignId)}/creatives`}
            className="inline-flex items-center rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-page hover:opacity-90"
          >
            Buka grid kreatif
          </Link>
        }
      >
        Di grid kreatif, tandakan kotak &ldquo;Banding&rdquo; pada kad yang hendak dinilai, lalu
        tekan &ldquo;Banding sisi-ke-sisi&rdquo;.
      </EmptyState>
    );
  }

  const currency = campaign.currency;

  return (
    <div className="space-y-5">
      {/* One column on a phone, one per creative once there is room — a
          four-up comparison at 390px wide would be unreadable. */}
      <div
        className="grid gap-4 sm:[grid-template-columns:var(--compare-cols)]"
        style={{ '--compare-cols': `repeat(${items.length}, minmax(0, 1fr))` } as CSSProperties}
      >
        {items.map((item) => {
          const verdict = diagnose(item, benchmarks);
          return (
            <Card key={item.creative_id} className="overflow-hidden">
              <div className="relative w-full bg-[#141413]" style={{ paddingTop: '100%' }}>
                <MediaThumb
                  url={item.media_url}
                  kind={item.media_kind}
                  thumbnail={item.thumbnail_url}
                  title={item.ad_name}
                />
              </div>
              <div className="px-3.5 py-3">
                <Link
                  href={`/c/${encodeURIComponent(campaignId)}/creatives/${item.creative_id}`}
                  className="block truncate text-[13px] font-semibold hover:underline"
                  title={item.ad_name}
                >
                  {item.ad_name}
                </Link>
                <p className="mt-1 text-[11px] text-ink-muted">{verdict.headline}</p>
                <div className="mt-3 border-t border-line pt-2.5">
                  <Funnel stages={item.funnel} compact />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <caption className="px-5 pt-4 pb-2 text-left text-[11px] text-ink-muted">
            Nilai terbaik bagi setiap baris ditanda dengan lambang mahkota dan label
            &ldquo;terbaik&rdquo;, bukan warna sahaja.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-2 text-left font-medium text-ink-muted">
                Metrik
              </th>
              {items.map((item) => (
                <th
                  key={item.creative_id}
                  scope="col"
                  className="max-w-[180px] truncate px-3 py-2 text-right font-medium text-ink"
                  title={item.ad_name}
                >
                  {item.ad_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => {
              const winner = bestIndex(items, metric);
              return (
                <tr key={metric.label} className="border-b border-line last:border-0">
                  <th scope="row" className="px-5 py-1.5 text-left font-normal text-ink-2">
                    {metric.label}
                    {metric.direction ? (
                      <span className="ml-1 text-[10px] text-ink-muted">
                        ({metric.direction === 'high' ? 'tinggi lebih baik' : 'rendah lebih baik'})
                      </span>
                    ) : null}
                  </th>
                  {items.map((item, index) => (
                    <td
                      key={item.creative_id}
                      className={cn(
                        'tnum px-3 py-1.5 text-right',
                        winner === index ? 'font-semibold text-ink' : 'text-ink-2',
                      )}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {winner === index ? (
                          <>
                            <Crown size={11} className="text-good" aria-hidden />
                            <span className="sr-only">terbaik</span>
                          </>
                        ) : null}
                        {metric.format(item, currency)}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
