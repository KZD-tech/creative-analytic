'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AXIS_COLOR, AXIS_STYLE, ChartTooltip, firstPayload, GRID_COLOR,
} from '@/components/charts/chart-kit';
import { METRICS, type HighlightRule, type MetricId } from '@/lib/metrics/catalog';
import type { ReportRow } from '@/lib/metrics/rollup';

/**
 * A ranking on one measure, so it is a single-hue bar chart, not a categorical
 * one: the colour carries "clears the benchmark" and nothing else. A legend
 * would be noise for one series, so the direct value label does that job.
 */
export function ReportChart({
  rows,
  metric,
  metrics,
  rule,
  currency,
}: {
  rows: ReportRow[];
  metric: MetricId;
  metrics: MetricId[];
  rule: HighlightRule | undefined;
  currency: string;
}) {
  const def = METRICS[metric];
  const data = rows
    .map((row) => ({ row, value: def.value(row) }))
    .filter((entry): entry is { row: ReportRow; value: number } => entry.value !== null)
    .slice(0, 25);

  if (data.length === 0) {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-line bg-surface text-[12px] text-ink-muted">
        Tiada nilai {def.label} untuk dipaparkan.
      </div>
    );
  }

  const threshold = rule?.kind === 'benchmark' ? rule.threshold : null;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-sm font-semibold text-ink">{def.label} mengikut baris</h3>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          {threshold !== null
            ? `Garisan putus-putus ialah benchmark kempen. Bar hijau mencapainya.`
            : `Bar hijau berada dalam kuartil terbaik bagi hasil yang dipaparkan.`}
          {rows.length > 25 ? ` Menunjukkan 25 teratas daripada ${rows.length}.` : ''}
        </p>
      </div>

      <div style={{ height: Math.max(160, data.length * 30 + 48) }} className="px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 6, right: 68, bottom: 6, left: 6 }}>
            <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
            <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: AXIS_COLOR }} />
            <YAxis
              type="category"
              dataKey={(entry: { row: ReportRow }) => entry.row.title}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={150}
              tickFormatter={(value: string) => (value.length > 22 ? `${value.slice(0, 21)}…` : value)}
            />
            {threshold !== null ? (
              <ReferenceLine x={threshold} stroke={AXIS_COLOR} strokeDasharray="3 3" />
            ) : null}
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) => {
                const entry = active ? firstPayload<{ row: ReportRow }>(payload) : null;
                if (!entry) return null;
                return (
                  <ChartTooltip
                    title={entry.row.title}
                    entries={metrics.map((id) => ({
                      label: METRICS[id].label,
                      value: METRICS[id].format(entry.row, currency),
                    }))}
                  />
                );
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              {data.map((entry) => {
                const good =
                  rule && rule.threshold !== null && rule.kind !== 'none'
                    ? def.direction === 'low'
                      ? entry.value <= rule.threshold
                      : entry.value >= rule.threshold
                    : false;
                return (
                  <Cell key={entry.row.rowKey} fill={good ? 'var(--good)' : 'var(--series-1)'} />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
