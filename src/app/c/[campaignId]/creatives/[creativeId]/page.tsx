import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  getBenchmarks,
  getCampaign,
  getCreative,
  getCreativeDailySeries,
  getPerformance,
  getTagAssignments,
  listTags,
} from '@/lib/db/queries';
import { deriveCreative } from '@/lib/metrics/derive';
import { diagnose } from '@/lib/metrics/diagnose';
import { resolveWindow } from '@/lib/window';
import { compact, money, multiple, num, pct, relativeDays } from '@/lib/format';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { Card, CardHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import { StatTile } from '@/components/ui/StatTile';
import { MediaThumb } from '@/components/creatives/MediaThumb';
import { Funnel } from '@/components/creatives/Funnel';
import { TagEditor } from '@/components/creatives/TagEditor';
import { FatigueChart } from '@/components/charts/FatigueChart';

export const dynamic = 'force-dynamic';

export default async function CreativeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; creativeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaignId, creativeId } = await params;
  const query = await searchParams;
  const window = resolveWindow(
    typeof query.range === 'string' ? query.range : undefined,
    typeof query.from === 'string' ? query.from : undefined,
    typeof query.to === 'string' ? query.to : undefined,
  );

  const loaded = await load(async () => {
    const [campaign, creative] = await Promise.all([getCampaign(campaignId), getCreative(creativeId)]);
    if (!campaign) return null;
    if (!creative || creative.campaign_id !== campaignId) notFound();

    const [performance, benchmarks, daily, tags, tagMap] = await Promise.all([
      getPerformance(campaignId, window),
      getBenchmarks(campaignId),
      getCreativeDailySeries(creativeId, window),
      listTags(campaignId),
      getTagAssignments(campaignId),
    ]);
    return { campaign, creative, performance, benchmarks, daily, tags, tagMap };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { campaign, creative, performance, benchmarks, daily, tags, tagMap } = loaded.data;

  const row = performance.find((item) => item.creative_id === creativeId);
  const currency = campaign.currency;

  if (!row) {
    return (
      <EmptyState title={creative.ad_name}>
        Tiada data untuk kreatif ini dalam julat tarikh yang dipilih. Cuba tukar julat kepada
        &ldquo;Semua masa&rdquo;.
      </EmptyState>
    );
  }

  const metrics = deriveCreative(row, benchmarks);
  const verdict = diagnose(metrics, benchmarks);
  const assigned = tagMap.get(creativeId) ?? [];

  const noticeTone =
    verdict.severity === 'critical'
      ? 'error'
      : verdict.severity === 'warning'
        ? 'warning'
        : verdict.severity === 'info'
          ? 'info'
          : 'ok';

  return (
    <div className="space-y-5">
      <Link
        href={`/c/${encodeURIComponent(campaignId)}/creatives`}
        className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> Semua kreatif
      </Link>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-line bg-[#141413]" style={{ paddingTop: '133%' }}>
            <MediaThumb
              url={creative.media_url}
              kind={creative.media_kind}
              thumbnail={creative.thumbnail_url}
              preview={creative.preview_url}
              autoPreview
              title={creative.ad_name}
            />
          </div>

          {creative.media_url ? (
            <a
              href={creative.media_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
            >
              Buka media asal <ExternalLink size={12} />
            </a>
          ) : (
            <p className="text-[11px] text-ink-muted">
              Tiada pautan video. Muat naik CSV Video Links di tab Data untuk memaparkannya di
              sini.
            </p>
          )}

          <Card className="px-4 py-3">
            <h3 className="mb-2 text-[12px] font-semibold">Tag</h3>
            <TagEditor
              campaignId={campaignId}
              creativeId={creativeId}
              available={tags}
              assigned={assigned}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold">{creative.ad_name}</h1>
            <p className="text-[12px] text-ink-muted">
              {creative.adset_name ?? 'Tiada ad set'}
              {creative.platform_campaign ? ` · ${creative.platform_campaign}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
              <Badge tone={metrics.status === 'winner' ? 'good' : 'neutral'}>
                {multiple(metrics.roas)} ROAS
              </Badge>
              <span>
                Aktif {creative.first_seen ?? '—'} → {creative.last_seen ?? '—'} (
                {relativeDays(creative.last_seen)})
              </span>
              {metrics.active_days > 0 ? <span>{metrics.active_days} hari data harian</span> : null}
            </div>
          </div>

          <Notice tone={noticeTone} title={verdict.headline}>
            <p>{verdict.detail}</p>
            <p className="mt-1.5">
              <strong>Cadangan:</strong> {verdict.action}
            </p>
            {verdict.upliftRevenue ? (
              <p className="mt-1.5">
                Jika peringkat ini sekadar mencapai benchmark, anggaran tambahan hasil{' '}
                <strong>{money(verdict.upliftRevenue, currency)}</strong> pada belanja yang sama.
              </p>
            ) : null}
          </Notice>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Belanja" value={money(metrics.spend, currency)} hint={`CPM ${money(metrics.cpm, currency, 2)}`} />
            <StatTile
              label="Hasil"
              value={money(metrics.revenue, currency)}
              hint={`${num(metrics.conversions)} derma`}
            />
            <StatTile
              label="ROAS"
              value={multiple(metrics.roas)}
              tone={metrics.roas !== null && metrics.roas >= benchmarks.roas_good ? 'good' : 'critical'}
              hint={`CPA ${money(metrics.cpa, currency)}`}
            />
            <StatTile
              label="Untung/rugi"
              value={money(metrics.profit, currency)}
              tone={metrics.profit >= 0 ? 'good' : 'critical'}
            />
          </div>

          <Card>
            <CardHeader
              title="Funnel kebocoran"
              subtitle="Bar penuh bermakna peringkat itu mencapai benchmark kempen."
            />
            <div className="px-5 pb-4">
              <Funnel stages={metrics.funnel} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Butiran metrik" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 pb-4 text-[12px] md:grid-cols-3">
              <Metric label="Impresi" value={compact(metrics.impressions)} />
              <Metric label="Jangkauan" value={compact(metrics.reach)} />
              <Metric label="Frekuensi" value={metrics.frequency ? `${metrics.frequency.toFixed(2)}x` : '—'} />
              <Metric label="Hook rate" value={pct(metrics.hookRate)} />
              <Metric label="Hold rate" value={pct(metrics.holdRate)} />
              <Metric label="Retention (100%/25%)" value={pct(metrics.retention)} />
              <Metric label="CTR (link)" value={pct(metrics.ctr, 2)} />
              <Metric label="CTR (semua)" value={pct(metrics.ctrAll, 2)} />
              <Metric label="Hook → klik" value={pct(metrics.hookToClick, 2)} />
              <Metric label="Klik link" value={num(metrics.link_clicks)} />
              <Metric label="Landing page views" value={num(metrics.landing_page_views)} />
              <Metric label="Kos / LPV" value={money(metrics.costPerLpv, currency, 2)} />
              <Metric label="CVR (derma/LPV)" value={pct(metrics.cvr)} />
              <Metric label="Purata derma" value={money(metrics.aov, currency)} />
              <Metric label="CPC (link)" value={money(metrics.cpc, currency, 2)} />
            </dl>
          </Card>

          <FatigueChart rows={daily} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tnum font-semibold text-ink">{value}</dd>
    </div>
  );
}
