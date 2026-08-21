'use client';

import Link from 'next/link';
import { money, multiple, num, pct } from '@/lib/format';
import { STATUS_LABELS, type CreativeMetrics } from '@/lib/metrics/derive';
import { cn } from '@/lib/cn';

const COLUMNS = [
  'Iklan',
  'Status',
  'Belanja',
  'Impresi',
  'Hook',
  'CTR',
  'LPV',
  'CVR',
  'Derma',
  'Hasil',
  'CPA',
  'ROAS',
];

export function CreativeTable({
  items,
  currency,
  campaignId,
  selected,
  onToggleSelect,
}: {
  items: CreativeMetrics[];
  currency: string;
  campaignId: string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[900px] text-[12px]">
        <thead>
          <tr className="border-b border-line">
            <th className="w-8 px-3 py-2" aria-label="Pilih" />
            {COLUMNS.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  'px-3 py-2 font-medium whitespace-nowrap text-ink-muted',
                  index === 0 ? 'text-left' : 'text-right',
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.creative_id} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Pilih ${item.ad_name}`}
                  checked={selected.has(item.creative_id)}
                  onChange={() => onToggleSelect(item.creative_id)}
                  className="size-3.5 accent-[color:var(--accent)]"
                />
              </td>
              <td className="max-w-[260px] px-3 py-2">
                <Link
                  href={`/c/${encodeURIComponent(campaignId)}/creatives/${item.creative_id}`}
                  className="block truncate font-medium text-ink hover:underline"
                  title={item.ad_name}
                >
                  {item.ad_name}
                </Link>
                <span className="block truncate text-[11px] text-ink-muted">
                  {item.adset_name ?? '—'}
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-ink-2">
                {STATUS_LABELS[item.status]}
              </td>
              <td className="tnum px-3 py-2 text-right">{money(item.spend, currency)}</td>
              <td className="tnum px-3 py-2 text-right">{num(item.impressions)}</td>
              <td className="tnum px-3 py-2 text-right">{pct(item.hookRate)}</td>
              <td className="tnum px-3 py-2 text-right">{pct(item.ctr, 2)}</td>
              <td className="tnum px-3 py-2 text-right">{num(item.landing_page_views)}</td>
              <td className="tnum px-3 py-2 text-right">{pct(item.cvr)}</td>
              <td className="tnum px-3 py-2 text-right">{num(item.conversions)}</td>
              <td className="tnum px-3 py-2 text-right">{money(item.revenue, currency)}</td>
              <td className="tnum px-3 py-2 text-right">{money(item.cpa, currency)}</td>
              <td className="tnum px-3 py-2 text-right font-semibold">{multiple(item.roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
