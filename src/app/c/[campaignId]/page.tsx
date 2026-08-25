import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  getBenchmarks,
  getCampaign,
  getDailySeries,
  getPerformance,
  getSummary,
} from '@/lib/db/queries';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { resolveWindow, previousWindow, windowLabel } from '@/lib/window';
import { summarise, change } from '@/lib/metrics/summary';
import { deriveAll } from '@/lib/metrics/derive';
import { leakSummary } from '@/lib/metrics/diagnose';
import { money, moneyCompact, multiple, num, pct } from '@/lib/format';
import { StatTile } from '@/components/ui/StatTile';
import { Card, CardHeader, EmptyState, SectionTitle, Badge } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import { SpendRevenueChart, DonorTrendChart, FunnelRateChart } from '@/components/charts/TrendCharts';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
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
  const prior = previousWindow(window);

  const loaded = await load(async () => {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return null;

    const [summaryRow, priorRow, daily, performance, benchmarks] = await Promise.all([
      getSummary(campaignId, window),
      prior ? getSummary(campaignId, prior) : Promise.resolve(null),
      getDailySeries(campaignId, window),
      getPerformance(campaignId, window),
      getBenchmarks(campaignId),
    ]);

    return { campaign, summaryRow, priorRow, daily, performance, benchmarks };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { campaign, summaryRow, priorRow, daily, performance, benchmarks } = loaded.data;

  const current = summarise(summaryRow);
  const previous = priorRow ? summarise(priorRow) : null;
  const items = deriveAll(performance, benchmarks);
  const winners = items.filter((item) => item.status === 'winner');
  const leaks = leakSummary(items, benchmarks);
  const currency = campaign.currency;

  if (performance.length === 0) {
    return (
      <EmptyState title="Belum ada data untuk kempen ini">
        Sambungkan akaun iklan di tab <strong>Data</strong>, kemudian kembali ke sini.
      </EmptyState>
    );
  }

  const hasDailyAds = daily.some((row) => row.spend > 0);

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>
          Ringkasan · {windowLabel(window)}
          {prior ? ' (dibandingkan dengan tempoh sebelumnya)' : ''}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatTile
            label="Belanja"
            value={moneyCompact(current.spend, currency)}
            delta={mkDelta(change(current.spend, previous?.spend ?? null))}
          />
          <StatTile
            label="Hasil"
            value={moneyCompact(current.revenue, currency)}
            delta={mkDelta(change(current.revenue, previous?.revenue ?? null))}
          />
          <StatTile
            label="ROAS"
            value={multiple(current.roas)}
            tone={current.roas !== null && current.roas >= benchmarks.roas_good ? 'good' : 'critical'}
            hint={`benchmark ${benchmarks.roas_good.toFixed(1)}x`}
            delta={mkDelta(change(current.roas, previous?.roas ?? null))}
          />
          <StatTile
            label="Untung/rugi"
            value={moneyCompact(current.profit, currency)}
            tone={current.profit >= 0 ? 'good' : 'critical'}
          />
          <StatTile
            label="Derma"
            value={num(current.conversions)}
            delta={mkDelta(change(current.conversions, previous?.conversions ?? null))}
          />
          <StatTile
            label="Purata derma"
            value={money(current.aov, currency)}
            hint={`CPA ${money(current.cpa, currency)}`}
          />
          <StatTile
            label="Winner"
            value={`${winners.length}/${items.length}`}
            hint={`≥ ${benchmarks.roas_good.toFixed(1)}x ROAS`}
            tone={winners.length > 0 ? 'good' : null}
          />
        </div>
      </section>

      {!hasDailyAds ? (
        <Notice tone="info" title="Graf belanja harian tidak tersedia">
          Data yang ada tiada pecahan harian, jadi hanya sisi derma mempunyai garis masa.
          Sambungkan akaun Meta Ads atau Google Ads di tab <strong>Data</strong> untuk mengaktifkan
          graf belanja — sync API sentiasa bawa pecahan harian.
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <SpendRevenueChart rows={daily} currency={currency} />
        <DonorTrendChart rows={daily} currency={currency} />
      </div>

      <FunnelRateChart rows={daily} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Di mana wang bocor"
            subtitle="Peringkat funnel pertama yang berada di bawah benchmark, ditimbang mengikut belanja."
          />
          <div className="px-5 pb-4">
            {leaks.length === 0 ? (
              <p className="text-[12px] text-ink-muted">
                Tiada kreatif yang bocor di bawah benchmark dalam tempoh ini.
              </p>
            ) : (
              <ul className="space-y-2">
                {leaks.map((leak) => (
                  <li key={leak.stage} className="flex items-center gap-3">
                    <span className="w-16 text-[12px] font-medium text-ink">{leak.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-critical"
                        style={{ width: `${Math.max(3, (leak.spend / (leaks[0]?.spend || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="tnum w-24 text-right text-[12px] font-semibold text-ink">
                      {moneyCompact(leak.spend, currency)}
                    </span>
                    <span className="w-16 text-right text-[11px] text-ink-muted">
                      {leak.count} iklan
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/c/${encodeURIComponent(campaignId)}/insights`}
              className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
            >
              Lihat analisis penuh <ArrowRight size={12} />
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Kreatif teratas" subtitle="Disusun mengikut ROAS dalam tempoh ini." />
          <div className="px-5 pb-4">
            <ul className="space-y-2">
              {[...items]
                .sort((a, z) => (z.roas ?? -1) - (a.roas ?? -1))
                .slice(0, 6)
                .map((item) => (
                  <li key={item.creative_id} className="flex items-center gap-3">
                    <Link
                      href={`/c/${encodeURIComponent(campaignId)}/creatives/${item.creative_id}`}
                      className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink hover:underline"
                    >
                      {item.ad_name}
                    </Link>
                    <Badge tone={item.status === 'winner' ? 'good' : 'neutral'}>
                      {multiple(item.roas)}
                    </Badge>
                    <span className="tnum w-20 text-right text-[11px] text-ink-muted">
                      {moneyCompact(item.spend, currency)}
                    </span>
                    <span className="tnum w-14 text-right text-[11px] text-ink-muted">
                      {pct(item.cvr)}
                    </span>
                  </li>
                ))}
            </ul>
            <Link
              href={`/c/${encodeURIComponent(campaignId)}/creatives`}
              className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
            >
              Semua kreatif <ArrowRight size={12} />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function mkDelta(value: number | null) {
  return value === null ? null : { value };
}
