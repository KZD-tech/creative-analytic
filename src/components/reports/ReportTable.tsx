'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { STATUS_LABELS } from '@/lib/metrics/derive';
import {
  METRICS, isHighlighted, isUnreliable, type HighlightRule, type MetricId,
} from '@/lib/metrics/catalog';
import type { ReportRow } from '@/lib/metrics/rollup';

export function ReportTable({
  rows,
  metrics,
  rules,
  currency,
  campaignId,
  selected,
  onToggleSelect,
  sort,
  onSort,
}: {
  rows: ReportRow[];
  metrics: MetricId[];
  rules: Record<string, HighlightRule>;
  currency: string;
  campaignId: string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  sort: MetricId;
  onSort: (id: MetricId) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[720px] text-[12px]">
        <thead>
          <tr className="border-b border-line">
            <th className="w-8 px-3 py-2" aria-label="Pilih" />
            <th scope="col" className="px-3 py-2 text-left font-medium text-ink-muted">
              Nama
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap text-ink-muted">
              Status
            </th>
            {metrics.map((id) => (
              <th
                key={id}
                scope="col"
                aria-sort={sort === id ? 'descending' : 'none'}
                className="px-3 py-2 text-right font-medium whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onSort(id)}
                  className={cn(
                    'inline-flex items-center gap-1 transition-colors',
                    sort === id ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {METRICS[id].label}
                  <span aria-hidden className={sort === id ? '' : 'opacity-0'}>
                    ↓
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowKey} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Pilih ${row.title}`}
                  checked={selected.has(row.sampleCreativeId)}
                  onChange={() => onToggleSelect(row.sampleCreativeId)}
                  className="size-3.5 accent-[color:var(--accent)]"
                />
              </td>
              <td className="max-w-[320px] px-3 py-2">
                <Link
                  href={`/c/${encodeURIComponent(campaignId)}/creatives/${row.sampleCreativeId}`}
                  className="block truncate font-medium text-ink hover:underline"
                  title={row.title}
                >
                  {row.title}
                </Link>
                {row.subtitle ? (
                  <span className="block truncate text-[11px] text-ink-muted">{row.subtitle}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-ink-2">
                {STATUS_LABELS[row.status]}
              </td>
              {metrics.map((id) => {
                const metric = METRICS[id];
                const good = isHighlighted(metric, row, rules[id]);
                const unreliable = isUnreliable(metric, row);
                return (
                  <td key={id} className="px-3 py-2 text-right">
                    <span
                      title={unreliable ? 'Belanja terlalu kecil untuk nisbah ini bermakna.' : undefined}
                      className={cn(
                        'tnum rounded-md px-1.5 py-0.5 font-medium',
                        good ? 'bg-good-soft font-semibold text-good' : unreliable ? 'text-ink-3' : 'text-ink',
                      )}
                    >
                      {metric.format(row, currency)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
