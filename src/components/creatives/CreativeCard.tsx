'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { compact, money, multiple, num, pct } from '@/lib/format';
import { STATUS_LABELS, type CreativeMetrics } from '@/lib/metrics/derive';
import type { Tag } from '@/types/db';
import { Badge } from '@/components/ui/primitives';
import { MediaThumb } from './MediaThumb';
import { Funnel } from './Funnel';

const STATUS_TONE = {
  winner: 'good',
  promising: 'warning',
  weak: 'serious',
  losing: 'critical',
  learning: 'neutral',
} as const;

const STATUS_MARK = {
  winner: '✓',
  promising: '◐',
  weak: '▽',
  losing: '✕',
  learning: '·',
} as const;

export function CreativeCard({
  item,
  tags,
  currency,
  campaignId,
  selected,
  onToggleSelect,
}: {
  item: CreativeMetrics;
  tags: Tag[];
  currency: string;
  campaignId: string;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const roasColor =
    item.status === 'winner'
      ? 'var(--good)'
      : item.status === 'promising'
        ? 'var(--warning)'
        : item.status === 'learning'
          ? 'var(--ink-muted)'
          : 'var(--critical)';

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-xl border bg-surface transition-shadow',
        selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:shadow-lg',
      )}
    >
      <div className="relative w-full overflow-hidden bg-[#141413]" style={{ paddingTop: '133%' }}>
        <MediaThumb
          url={item.media_url}
          kind={item.media_kind}
          thumbnail={item.thumbnail_url}
          title={item.ad_name}
        />

        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <Badge tone={STATUS_TONE[item.status]} icon={<span aria-hidden>{STATUS_MARK[item.status]}</span>}>
            {STATUS_LABELS[item.status]}
          </Badge>
          <span className="tnum rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {money(item.spend, currency)}
          </span>
        </div>

        <label
          className="absolute right-2 bottom-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.creative_id)}
            className="size-3 accent-[color:var(--accent)]"
          />
          Banding
        </label>
      </div>

      <div className="px-3.5 py-3">
        <Link
          href={`/c/${encodeURIComponent(campaignId)}/creatives/${item.creative_id}`}
          className="block truncate text-[13px] font-semibold text-ink hover:underline"
          title={item.ad_name}
        >
          {item.ad_name}
        </Link>
        <p className="truncate text-[11px] text-ink-muted" title={item.adset_name ?? undefined}>
          {item.adset_name ?? 'Tiada ad set'}
        </p>

        {tags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <li
                key={tag.id}
                className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2"
                title={tag.dimension}
              >
                {tag.label}
              </li>
            ))}
            {tags.length > 4 ? (
              <li className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">
                +{tags.length - 4}
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-muted">
          <span>
            <b className="tnum font-semibold text-ink">{compact(item.impressions)}</b> impresi
          </span>
          {item.frequency ? (
            <span>
              Freq <b className="tnum font-semibold text-ink">{item.frequency.toFixed(1)}x</b>
            </span>
          ) : null}
          {item.cpm ? (
            <span>
              CPM <b className="tnum font-semibold text-ink">{money(item.cpm, currency, 2)}</b>
            </span>
          ) : null}
        </div>

        <div className="mt-3 border-t border-line pt-2.5">
          <Funnel stages={item.funnel} compact />
        </div>

        <div className="mt-3 flex items-end justify-between border-t border-line pt-2.5">
          <div>
            <div className="text-[10px] text-ink-muted">ROAS</div>
            <div className="tnum text-base font-bold" style={{ color: roasColor }}>
              {multiple(item.roas)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-ink-muted">Hasil · purata</div>
            <div className="tnum text-[12px] font-semibold text-ink">
              {money(item.revenue, currency)} · {money(item.aov, currency)}
            </div>
            <div className="text-[10px] text-ink-muted">
              {num(item.conversions)} derma · CVR {pct(item.cvr)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
