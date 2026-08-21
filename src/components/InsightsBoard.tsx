'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { breakdownByDimension } from '@/lib/metrics/breakdown';
import { TAG_DIMENSION_LABELS, type Tag, type TagDimension } from '@/types/db';
import type { CreativeMetrics } from '@/lib/metrics/derive';
import { BreakdownChart } from '@/components/charts/BreakdownChart';
import { money, multiple, num, pct } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/primitives';

export function InsightsBoard({
  items,
  tagsByCreative,
  dimensions,
  currency,
  roasTarget,
  campaignId,
}: {
  items: CreativeMetrics[];
  tagsByCreative: Record<string, Tag[]>;
  dimensions: TagDimension[];
  currency: string;
  roasTarget: number;
  campaignId: string;
}) {
  const [dimension, setDimension] = useState<TagDimension>(dimensions[0] ?? 'hook');
  const rows = useMemo(
    () => breakdownByDimension(items, tagsByCreative, dimension),
    [items, tagsByCreative, dimension],
  );

  const best = rows.filter((row) => row.key !== '__untagged__' && row.roas !== null);
  const top = best[0]
    ? [...best].sort((a, z) => (z.roas ?? 0) - (a.roas ?? 0))[0]
    : null;
  const worst = best[0]
    ? [...best].sort((a, z) => (a.roas ?? 0) - (z.roas ?? 0))[0]
    : null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Dimensi tag" className="flex flex-wrap gap-1">
        {dimensions.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={dimension === value}
            onClick={() => setDimension(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] transition-colors',
              dimension === value
                ? 'border-line-strong bg-surface-3 font-medium text-ink'
                : 'border-line text-ink-muted hover:text-ink',
            )}
          >
            {TAG_DIMENSION_LABELS[value]}
          </button>
        ))}
      </div>

      {top && worst && top.key !== worst.key ? (
        <Card className="px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Pada dimensi <strong className="text-ink">{TAG_DIMENSION_LABELS[dimension]}</strong>,{' '}
            <strong className="text-ink">{top.label}</strong> memulangkan{' '}
            <strong className="text-ink">{multiple(top.roas)}</strong> daripada{' '}
            {money(top.spend, currency)} belanja, manakala{' '}
            <strong className="text-ink">{worst.label}</strong> hanya{' '}
            <strong className="text-ink">{multiple(worst.roas)}</strong> daripada{' '}
            {money(worst.spend, currency)}. Alihkan bajet ke arah {top.label} dan hentikan variasi{' '}
            {worst.label} yang tidak menunjukkan tanda pemulihan.
          </p>
        </Card>
      ) : null}

      <BreakdownChart
        rows={rows}
        currency={currency}
        target={roasTarget}
        dimensionLabel={TAG_DIMENSION_LABELS[dimension]}
      />

      <Card className="overflow-x-auto">
        <CardHeader
          title={`Butiran mengikut ${TAG_DIMENSION_LABELS[dimension].toLowerCase()}`}
          subtitle="Setiap kadar dikira semula daripada jumlah impresi, klik dan derma."
        />
        <table className="w-full min-w-[760px] text-[12px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-2 text-left font-medium text-ink-muted">Tag</th>
              {['Iklan', 'Belanja', 'Hasil', 'ROAS', 'Derma', 'CPA', 'Hook', 'CTR', 'CVR'].map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-right font-medium text-ink-muted">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-0">
                <th scope="row" className="px-5 py-1.5 text-left font-medium text-ink">
                  {row.label}
                </th>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{num(row.creatives)}</td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{money(row.spend, currency)}</td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{money(row.revenue, currency)}</td>
                <td
                  className={cn(
                    'tnum px-3 py-1.5 text-right font-semibold',
                    row.roas !== null && row.roas >= roasTarget ? 'text-good' : 'text-ink',
                  )}
                >
                  {multiple(row.roas)}
                </td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{num(row.conversions)}</td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{money(row.cpa, currency)}</td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{pct(row.hookRate)}</td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{pct(row.ctr, 2)}</td>
                <td className="tnum px-3 py-1.5 text-right text-ink-2">{pct(row.cvr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[11px] text-ink-muted">
          Tiada tag?{' '}
          <Link
            href={`/c/${encodeURIComponent(campaignId)}/creatives`}
            className="text-accent hover:underline"
          >
            Pilih beberapa kreatif di grid
          </Link>{' '}
          dan gunakan borang tag pukal di bar bawah.
        </p>
      </Card>
    </div>
  );
}
