'use client';

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { compact, dayLabel, money, moneyCompact, multiple, num, pct } from '@/lib/format';
import type { DailyRow } from '@/types/db';

interface Props {
  rows: DailyRow[];
  currency: string;
}

/** Spend and revenue share a unit, so they belong on one scale in one chart. */
export function SpendRevenueChart({ rows, currency }: Props) {
  const legend = [
    { label: 'Belanja', color: SERIES[1] },
    { label: 'Hasil', color: SERIES[2] },
  ];

  return (
    <ChartFrame
      title="Belanja vs hasil"
      subtitle="Kedua-duanya dalam mata wang yang sama, jadi satu skala sahaja digunakan."
      legend={legend}
      table={
        <DataTable
          columns={['Hari', 'Belanja', 'Hasil', 'ROAS']}
          rows={rows.map((row) => [
            row.day,
            money(row.spend, currency),
            money(row.revenue, currency),
            row.spend > 0 ? multiple(row.revenue / row.spend) : '—',
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />
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
            width={54}
            tickFormatter={(value: number) => moneyCompact(value, currency)}
          />
          <Tooltip
            cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const data = active ? firstPayload<DailyRow>(payload) : null;
              if (!data) return null;
              return (
                <ChartTooltip
                  title={data.day}
                  entries={[
                    { label: 'Belanja', value: money(data.spend, currency), color: SERIES[1] },
                    { label: 'Hasil', value: money(data.revenue, currency), color: SERIES[2] },
                    {
                      label: 'ROAS',
                      value: data.spend > 0 ? multiple(data.revenue / data.spend) : '—',
                    },
                    { label: 'Derma', value: num(data.conversions) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="spend" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke={SERIES[2]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DonorTrendChart({ rows, currency }: Props) {
  return (
    <ChartFrame
      title="Derma setiap hari"
      subtitle="Bilangan derma yang direkodkan Onpay, mengikut zon waktu kempen."
      table={
        <DataTable
          columns={['Hari', 'Derma', 'Hasil', 'Purata']}
          rows={rows.map((row) => [
            row.day,
            num(row.conversions),
            money(row.revenue, currency),
            row.conversions > 0 ? money(row.revenue / row.conversions, currency) : '—',
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="donor-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
            width={38}
            allowDecimals={false}
            tickFormatter={(value: number) => compact(value)}
          />
          <Tooltip
            cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const data = active ? firstPayload<DailyRow>(payload) : null;
              if (!data) return null;
              return (
                <ChartTooltip
                  title={data.day}
                  entries={[
                    { label: 'Derma', value: num(data.conversions), color: SERIES[0] },
                    { label: 'Hasil', value: money(data.revenue, currency) },
                    {
                      label: 'Purata derma',
                      value:
                        data.conversions > 0
                          ? money(data.revenue / data.conversions, currency)
                          : '—',
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="conversions"
            stroke={SERIES[0]}
            strokeWidth={2}
            fill="url(#donor-fill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * Hook sits near 20%, CTR near 2%, LPV near 50%. On one shared scale the two
 * small rates flatten into the axis and stop being readable, and a second
 * y-axis would make their crossover a matter of scale choice. Small multiples
 * are the honest form: one panel per rate, each on its own scale, sharing the
 * x axis and the reading order of the funnel.
 */
export function FunnelRateChart({ rows }: { rows: DailyRow[] }) {
  const data = rows.map((row) => ({
    day: row.day,
    hook: row.impressions > 0 ? row.video_3s_views / row.impressions : null,
    ctr: row.impressions > 0 ? row.link_clicks / row.impressions : null,
    lpv: row.link_clicks > 0 ? row.landing_page_views / row.link_clicks : null,
    cvr: row.landing_page_views > 0 ? row.conversions / row.landing_page_views : null,
  }));

  const panels = [
    { key: 'hook', label: 'Hook', basis: '% daripada impresi', color: SERIES[0], decimals: 1 },
    { key: 'ctr', label: 'CTR', basis: '% daripada impresi', color: SERIES[1], decimals: 2 },
    { key: 'lpv', label: 'Kadar LPV', basis: '% daripada klik', color: SERIES[2], decimals: 1 },
    { key: 'cvr', label: 'CVR', basis: '% daripada LPV', color: SERIES[3], decimals: 1 },
  ] as const;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-sm font-semibold text-ink">Kadar funnel dari hari ke hari</h3>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Empat panel, empat skala. Setiap kadar bergerak dalam julat yang sangat berbeza, jadi
          menindihnya pada satu paksi hanya akan meratakan yang kecil.
        </p>
      </div>

      <div className="grid gap-x-4 gap-y-2 px-3 pt-1 pb-3 sm:grid-cols-2 xl:grid-cols-4">
        {panels.map((panel) => (
          <FunnelPanel key={panel.key} data={data} panel={panel} />
        ))}
      </div>

      <details className="border-t border-line px-5 py-2">
        <summary className="cursor-pointer text-[11px] text-ink-muted">Papar sebagai jadual</summary>
        <div className="max-h-64 overflow-auto pt-2">
          <DataTable
            columns={['Hari', 'Hook', 'CTR', 'Kadar LPV', 'CVR']}
            rows={data.map((row) => [
              row.day,
              pct(row.hook),
              pct(row.ctr, 2),
              pct(row.lpv),
              pct(row.cvr),
            ])}
          />
        </div>
      </details>
    </section>
  );
}

function FunnelPanel({
  data,
  panel,
}: {
  data: { day: string; hook: number | null; ctr: number | null; lpv: number | null; cvr: number | null }[];
  panel: { key: 'hook' | 'ctr' | 'lpv' | 'cvr'; label: string; basis: string; color: string; decimals: number };
}) {
  const latest = [...data].reverse().find((row) => row[panel.key] !== null)?.[panel.key] ?? null;

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 px-2">
        <span className="text-[11px] font-medium text-ink">{panel.label}</span>
        <span className="tnum text-[12px] font-semibold" style={{ color: panel.color }}>
          {pct(latest, panel.decimals)}
        </span>
      </figcaption>
      <div className="px-2 text-[10px] text-ink-muted">{panel.basis}</div>

      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 2, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={dayLabel}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: AXIS_COLOR }}
              minTickGap={28}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={38}
              domain={[0, 'auto']}
              tickFormatter={(value: number) => `${(value * 100).toFixed(panel.decimals === 2 ? 1 : 0)}%`}
            />
            <Tooltip
              cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = active ? firstPayload<(typeof data)[number]>(payload) : null;
                if (!d) return null;
                return (
                  <ChartTooltip
                    title={d.day}
                    entries={[
                      { label: panel.label, value: pct(d[panel.key], panel.decimals), color: panel.color },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey={panel.key}
              stroke={panel.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
