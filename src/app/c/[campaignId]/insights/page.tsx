import { getBenchmarks, getCampaign, getPerformance, getTagAssignments } from '@/lib/db/queries';
import { deriveAll } from '@/lib/metrics/derive';
import { diagnose, leakSummary } from '@/lib/metrics/diagnose';
import { usedDimensions } from '@/lib/metrics/breakdown';
import { resolveWindow } from '@/lib/window';
import { money, moneyCompact, multiple } from '@/lib/format';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { InsightsBoard } from '@/components/InsightsBoard';
import { Card, CardHeader, EmptyState, SectionTitle } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import Link from 'next/link';
import type { Tag, TagDimension } from '@/types/db';

export const dynamic = 'force-dynamic';

const FALLBACK_DIMENSIONS: TagDimension[] = ['hook', 'format', 'angle', 'offer'];

export default async function InsightsPage({
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

  const loaded = await load(async () => {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return null;

    const [performance, benchmarks, tagMap] = await Promise.all([
      getPerformance(campaignId, window),
      getBenchmarks(campaignId),
      getTagAssignments(campaignId),
    ]);
    return { campaign, performance, benchmarks, tagMap };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { campaign, performance, benchmarks, tagMap } = loaded.data;

  if (performance.length === 0) {
    return (
      <EmptyState title="Belum ada data">
        Muat naik eksport Ads Manager di tab <strong>Data</strong> dahulu.
      </EmptyState>
    );
  }

  const items = deriveAll(performance, benchmarks);
  const leaks = leakSummary(items, benchmarks);
  const tagsByCreative: Record<string, Tag[]> = Object.fromEntries(tagMap);
  const dimensions = usedDimensions(tagMap);
  const currency = campaign.currency;

  const wastedSpend = items
    .filter((item) => item.status === 'losing' || item.status === 'weak')
    .reduce((total, item) => total + item.spend, 0);

  const worst = [...items]
    .filter((item) => item.spend >= benchmarks.min_spend)
    .sort((a, z) => a.profit - z.profit)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Analisis kebocoran</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader
              title="Peringkat funnel yang paling banyak makan bajet"
              subtitle="Peringkat pertama yang jatuh di bawah benchmark bagi setiap kreatif."
            />
            <div className="px-5 pb-4">
              {leaks.length === 0 ? (
                <p className="text-[12px] text-ink-muted">Tiada kebocoran dikesan.</p>
              ) : (
                <ul className="space-y-2.5">
                  {leaks.map((leak) => (
                    <li key={leak.stage} className="flex items-center gap-3">
                      <span className="w-16 text-[12px] font-medium">{leak.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-critical"
                          style={{
                            width: `${Math.max(3, (leak.spend / (leaks[0]?.spend || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="tnum w-24 text-right text-[12px] font-semibold">
                        {moneyCompact(leak.spend, currency)}
                      </span>
                      <span className="w-16 text-right text-[11px] text-ink-muted">
                        {leak.count} iklan
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Notice tone="warning" className="mt-4">
                {money(wastedSpend, currency)} dibelanjakan pada kreatif yang berada di bawah{' '}
                {benchmarks.roas_ok.toFixed(1)}x ROAS dalam tempoh ini.
              </Notice>
            </div>
          </Card>

          <Card>
            <CardHeader title="Paling rugi" subtitle="Hasil tolak belanja, kreatif yang sudah melepasi ambang data." />
            <div className="px-5 pb-4">
              {worst.length === 0 ? (
                <p className="text-[12px] text-ink-muted">
                  Tiada kreatif yang cukup belanja untuk dinilai.
                </p>
              ) : (
                <ul className="space-y-2">
                  {worst.map((item) => {
                    const verdict = diagnose(item, benchmarks);
                    return (
                      <li key={item.creative_id} className="flex items-center gap-3">
                        <Link
                          href={`/c/${encodeURIComponent(campaignId)}/creatives/${item.creative_id}`}
                          className="min-w-0 flex-1 truncate text-[12px] font-medium hover:underline"
                        >
                          {item.ad_name}
                        </Link>
                        <span className="w-28 truncate text-right text-[11px] text-ink-muted">
                          {verdict.headline}
                        </span>
                        <span className="tnum w-16 text-right text-[11px] text-ink-muted">
                          {multiple(item.roas)}
                        </span>
                        <span className="tnum w-20 text-right text-[12px] font-semibold text-critical">
                          {moneyCompact(item.profit, currency)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </section>

      <section>
        <SectionTitle>Breakdown mengikut tag</SectionTitle>
        {dimensions.length === 0 ? (
          <EmptyState title="Belum ada tag">
            Tag ialah teras analisis kreatif: labelkan setiap iklan dengan hook, format, angle
            atau offer, dan dashboard boleh beritahu <em>ciri</em> mana yang menang, bukan sekadar{' '}
            <em>iklan</em> mana. Buka grid kreatif, pilih beberapa kad, dan gunakan borang tag
            pukal.
          </EmptyState>
        ) : (
          <InsightsBoard
            items={items}
            tagsByCreative={tagsByCreative}
            dimensions={dimensions.length > 0 ? dimensions : FALLBACK_DIMENSIONS}
            currency={currency}
            roasTarget={benchmarks.roas_good}
            campaignId={campaignId}
          />
        )}
      </section>
    </div>
  );
}
