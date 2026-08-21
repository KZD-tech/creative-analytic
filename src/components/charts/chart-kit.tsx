'use client';

import { useState, type ReactNode } from 'react';
import { Table2, LineChart as LineIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Fixed slot order, never cycled. Three of these sit below 3:1 on the light
 * surface, which is why every chart here ships a legend, direct labels or the
 * table view — the relief rule from the palette spec.
 */
export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const;

export const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--ink-muted)',
} as const;

export const GRID_COLOR = 'var(--grid)';
export const AXIS_COLOR = 'var(--axis)';

/** Recharts hands back a readonly payload of loose shape; this narrows it once. */
export function firstPayload<T>(payload: unknown): T | null {
  const list = payload as readonly { payload?: unknown }[] | undefined;
  const row = list?.[0]?.payload;
  return (row as T | undefined) ?? null;
}

export interface TooltipEntry {
  label: string;
  value: string;
  color?: string;
}

export function ChartTooltip({ title, entries }: { title: string; entries: TooltipEntry[] }) {
  return (
    <div className="pointer-events-none rounded-lg border border-line bg-surface px-3 py-2 shadow-lg">
      <div className="mb-1 text-[11px] font-semibold text-ink">{title}</div>
      <div className="space-y-0.5">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2 text-[11px]">
            {entry.color ? (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full ring-2 ring-[color:var(--surface)]"
                style={{ background: entry.color }}
              />
            ) : null}
            <span className="text-ink-2">{entry.label}</span>
            <span className="tnum ml-auto font-semibold text-ink">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Wraps a chart with its title, legend and an equivalent table. The table is the
 * accessibility relief for low-contrast series and the answer for anyone who
 * needs the exact numbers.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  height = 260,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: { label: string; color: string }[];
  table?: ReactNode;
  children: ReactNode;
  height?: number;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {legend && legend.length > 1 ? (
            <ul className="flex flex-wrap items-center gap-3">
              {legend.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                  <span
                    aria-hidden
                    className="size-2 rounded-full ring-2 ring-[color:var(--surface)]"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
          {table ? (
            <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
              <button
                type="button"
                onClick={() => setView('chart')}
                aria-pressed={view === 'chart'}
                title="Paparan graf"
                className={cn(
                  'rounded-md p-1',
                  view === 'chart' ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                <LineIcon size={13} strokeWidth={2} />
                <span className="sr-only">Paparan graf</span>
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
                title="Paparan jadual"
                className={cn(
                  'rounded-md p-1',
                  view === 'table' ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                <Table2 size={13} strokeWidth={2} />
                <span className="sr-only">Paparan jadual</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {view === 'chart' ? (
        <div className="px-2 pb-3" style={{ height }}>
          {children}
        </div>
      ) : (
        <div className="max-h-80 overflow-auto px-5 pb-4">{table}</div>
      )}
    </section>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 bg-surface">
        <tr>
          {columns.map((column, index) => (
            <th
              key={column}
              scope="col"
              className={cn(
                'border-b border-line py-1.5 font-medium text-ink-muted',
                index === 0 ? 'text-left' : 'text-right',
              )}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={cn(
                  'border-b border-line py-1.5',
                  cellIndex === 0 ? 'text-left text-ink-2' : 'tnum text-right text-ink',
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
