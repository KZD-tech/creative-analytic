'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/metrics/derive';
import { METRICS, isHighlighted, type HighlightRule, type MetricId } from '@/lib/metrics/catalog';
import type { ReportRow } from '@/lib/metrics/rollup';
import type { Tag } from '@/types/db';
import { Badge } from '@/components/ui/primitives';
import { MediaThumb } from '@/components/creatives/MediaThumb';

const STATUS_TONE = {
  winner: 'good', promising: 'warning', weak: 'serious',
  losing: 'critical', learning: 'neutral',
} as const;

const STATUS_MARK = {
  winner: '✓', promising: '◐', weak: '▽', losing: '✕', learning: '·',
} as const;

export function ReportCard({
  row,
  metrics,
  rules,
  tags,
  currency,
  campaignId,
  selected,
  onToggleSelect,
}: {
  row: ReportRow;
  metrics: MetricId[];
  rules: Record<string, HighlightRule>;
  tags: Tag[];
  currency: string;
  campaignId: string;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const href = `/c/${encodeURIComponent(campaignId)}/creatives/${row.sampleCreativeId}`;

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-surface transition-shadow',
        selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:shadow-lg',
      )}
    >
      <div className="relative w-full overflow-hidden bg-[#141413]" style={{ paddingTop: '100%' }}>
        <MediaThumb
          url={row.media_url}
          kind={row.media_kind}
          thumbnail={row.thumbnail_url}
          title={row.title}
        />

        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <Badge tone={STATUS_TONE[row.status]} icon={<span aria-hidden>{STATUS_MARK[row.status]}</span>}>
            {STATUS_LABELS[row.status]}
          </Badge>
          {row.memberCount > 1 ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {row.memberCount} iklan
            </span>
          ) : (
            <span className="tnum rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {money(row.spend, currency)}
            </span>
          )}
        </div>

        <label
          className="absolute right-2 bottom-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.sampleCreativeId)}
            className="size-3 accent-[color:var(--accent)]"
          />
          Banding
        </label>
      </div>

      <div className="flex flex-1 flex-col px-3.5 py-3">
        <Link
          href={href}
          className="line-clamp-2 text-[13px] leading-snug font-semibold text-ink hover:underline"
          title={row.title}
        >
          {row.title}
        </Link>
        {row.subtitle ? (
          <p className="mt-0.5 truncate text-[11px] text-ink-muted" title={row.subtitle}>
            {row.subtitle}
          </p>
        ) : null}

        {tags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <li key={tag.id} className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2">
                {tag.label}
              </li>
            ))}
            {tags.length > 3 ? (
              <li className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">
                +{tags.length - 3}
              </li>
            ) : null}
          </ul>
        ) : null}

        <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          {metrics.map((id) => {
            const metric = METRICS[id];
            const good = isHighlighted(metric, row, rules[id]);
            return (
              <div key={id} className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-ink-2">{metric.label}</dt>
                <dd
                  className={cn(
                    'tnum rounded-md px-1.5 py-0.5 text-[13px] font-semibold',
                    good ? 'bg-good-soft text-good' : 'text-ink',
                  )}
                >
                  {metric.format(row, currency)}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </article>
  );
}
