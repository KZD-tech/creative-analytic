'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS_COLOR,
  AXIS_STYLE,
  ChartFrame,
  ChartTooltip,
  DataTable,
  firstPayload,
  GRID_COLOR,
  SERIES,
} from './chart-kit';
import { dayLabel, num, pct } from '@/lib/format';
import type { CreativeDailyRow } from '@/types/db';

/**
 * Frequency and CTR have different units, so they are indexed to 100 at the
 * first day with data and share a single scale. Two y-axes would let the
 * crossover point be moved by scale choice alone.
 */
export function FatigueChart({ rows }: { rows: CreativeDailyRow[] }) {
  const withData = rows.filter((row) => row.impressions > 0);

  const baseFrequency = withData.find((row) => (row.frequency ?? 0) > 0)?.frequency ?? null;
  const first = withData[0];
  const baseCtr = first && first.impressions > 0 ? first.link_clicks / first.impressions : null;

  const data = withData.map((row) => {
    const ctr = row.impressions > 0 ? row.link_clicks / row.impressions : null;
    return {
      day: row.day,
      rawFrequency: row.frequency,
      rawCtr: ctr,
      frequency: baseFrequency && row.frequency ? (row.frequency / baseFrequency) * 100 : null,
      ctr: baseCtr && ctr ? (ctr / baseCtr) * 100 : null,
    };
  });

  // Only announce a series the chart actually draws — a Meta export without a
  // frequency column would otherwise show a legend entry with no line.
  const legend: { label: string; color: string }[] = [];
  if (data.some((row) => row.frequency !== null)) {
    legend.push({ label: 'Frekuensi (indeks)', color: SERIES[1] });
  }
  if (data.some((row) => row.ctr !== null)) {
    legend.push({ label: 'CTR (indeks)', color: SERIES[0] });
  }

  if (data.length < 2 || (!baseFrequency && !baseCtr)) {
    return (
      <ChartFrame title="Keletihan kreatif" subtitle="Perlu sekurang-kurangnya dua hari data harian.">
        <div className="grid h-full place-items-center text-[12px] text-ink-muted">
          Perlu sekurang-kurangnya dua hari data disegerak untuk melihat lengkung ini.
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title="Keletihan kreatif"
      subtitle="Kedua-dua garisan diindeks kepada 100 pada hari pertama, supaya boleh dibaca pada satu skala. Frekuensi naik sambil CTR jatuh = kreatif sudah letih."
      legend={legend}
      table={
        <DataTable
          columns={['Hari', 'Frekuensi', 'CTR', 'Indeks freq', 'Indeks CTR']}
          rows={data.map((row) => [
            row.day,
            row.rawFrequency ? row.rawFrequency.toFixed(2) : '—',
            pct(row.rawCtr, 2),
            row.frequency ? num(row.frequency) : '—',
            row.ctr ? num(row.ctr) : '—',
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: AXIS_COLOR }}
            minTickGap={24}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(value: number) => value.toFixed(0)}
          />
          <ReferenceLine y={100} stroke={AXIS_COLOR} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const d = active ? firstPayload<(typeof data)[number]>(payload) : null;
              if (!d) return null;
              return (
                <ChartTooltip
                  title={d.day}
                  entries={[
                    {
                      label: 'Frekuensi',
                      value: d.rawFrequency ? d.rawFrequency.toFixed(2) : '—',
                      color: SERIES[1],
                    },
                    { label: 'CTR', value: pct(d.rawCtr, 2), color: SERIES[0] },
                    { label: 'Indeks frekuensi', value: d.frequency ? num(d.frequency) : '—' },
                    { label: 'Indeks CTR', value: d.ctr ? num(d.ctr) : '—' },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="frequency"
            stroke={SERIES[1]}
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="ctr"
            stroke={SERIES[0]}
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
