'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
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
} from './chart-kit';
import { money, multiple, num, pct } from '@/lib/format';
import type { BreakdownRow } from '@/lib/metrics/breakdown';

/**
 * ROAS is a magnitude against one benchmark, so a single hue carries it and the
 * status palette marks pass/fail — categorical colours would imply the tags are
 * unrelated categories rather than points on one scale.
 */
export function BreakdownChart({
  rows,
  currency,
  target,
  dimensionLabel,
}: {
  rows: BreakdownRow[];
  currency: string;
  target: number;
  dimensionLabel: string;
}) {
  const data = rows
    .filter((row) => row.spend > 0)
    .map((row) => ({ ...row, roasValue: row.roas ?? 0 }));

  if (data.length === 0) {
    return (
      <ChartFrame title={`ROAS mengikut ${dimensionLabel.toLowerCase()}`}>
        <div className="grid h-full place-items-center text-[12px] text-ink-muted">
          Belum ada tag pada dimensi ini.
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={`ROAS mengikut ${dimensionLabel.toLowerCase()}`}
      subtitle={`Garisan putus-putus ialah benchmark ${target.toFixed(1)}x. Kadar dikira semula daripada jumlah, bukan purata kadar.`}
      height={Math.max(150, data.length * 44 + 52)}
      table={
        <DataTable
          columns={['Tag', 'Iklan', 'Belanja', 'Hasil', 'ROAS', 'Hook', 'CTR', 'CVR']}
          rows={data.map((row) => [
            row.label,
            num(row.creatives),
            money(row.spend, currency),
            money(row.revenue, currency),
            multiple(row.roas),
            pct(row.hookRate),
            pct(row.ctr, 2),
            pct(row.cvr),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 44, bottom: 6, left: 6 }}
        >
          <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: AXIS_COLOR }}
            tickFormatter={(value: number) => `${value.toFixed(1)}x`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <ReferenceLine x={target} stroke={AXIS_COLOR} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ active, payload }) => {
              const d = active ? firstPayload<BreakdownRow>(payload) : null;
              if (!d) return null;
              return (
                <ChartTooltip
                  title={d.label}
                  entries={[
                    { label: 'ROAS', value: multiple(d.roas) },
                    { label: 'Belanja', value: money(d.spend, currency) },
                    { label: 'Hasil', value: money(d.revenue, currency) },
                    { label: 'Derma', value: num(d.conversions) },
                    { label: 'Hook', value: pct(d.hookRate) },
                    { label: 'CTR', value: pct(d.ctr, 2) },
                    { label: 'CVR', value: pct(d.cvr) },
                    { label: 'Iklan', value: `${d.creatives}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="roasValue" radius={[0, 4, 4, 0]} maxBarSize={20} label={renderLabel}
            isAnimationActive={false}
          >
            {data.map((row) => (
              <Cell
                key={row.key}
                fill={row.roasValue >= target ? 'var(--good)' : 'var(--series-1)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function renderLabel(props: unknown) {
  const { x, y, width, height, value } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  };
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fill="var(--ink-2)"
    >
      {`${value.toFixed(2)}x`}
    </text>
  );
}
