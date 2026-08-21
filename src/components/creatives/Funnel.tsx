import { cn } from '@/lib/cn';
import { num, pct } from '@/lib/format';
import type { FunnelStage } from '@/lib/metrics/derive';
import type { Grade } from '@/lib/metrics/benchmarks';

const GRADE_COLOR: Record<Grade, string> = {
  good: 'var(--good)',
  ok: 'var(--warning)',
  weak: 'var(--critical)',
  none: 'var(--axis)',
};

const GRADE_LABEL: Record<Grade, string> = {
  good: 'atas benchmark',
  ok: 'sederhana',
  weak: 'bawah benchmark',
  none: 'tiada data',
};

/**
 * Each stage is normalised against its own benchmark rather than against the
 * stage above it: a bar is "full" when it is comfortably past target, so the
 * short bar is always the one to fix.
 */
function width(stage: FunnelStage): number {
  if (stage.rate === null || stage.good <= 0) return 0;
  return Math.max(2, Math.min((stage.rate / stage.good) * 100, 100));
}

export function Funnel({
  stages,
  compact = false,
}: {
  stages: FunnelStage[];
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      {stages.map((stage) => (
        <div key={stage.key} className="grid grid-cols-[42px_1fr_auto] items-center gap-2">
          <span className="text-[10px] text-ink-muted">{stage.label}</span>

          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
            role="img"
            aria-label={`${stage.label}: ${pct(stage.rate)} ${stage.basis}, ${GRADE_LABEL[stage.grade]}`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${width(stage)}%`, background: GRADE_COLOR[stage.grade] }}
            />
          </div>

          <span className="tnum text-right text-[11px] font-semibold" style={{ color: GRADE_COLOR[stage.grade] }}>
            {stage.key === 'convert' || stage.key === 'landing'
              ? `${num(stage.count)} · ${pct(stage.rate)}`
              : pct(stage.rate, stage.key === 'click' ? 2 : 1)}
          </span>
        </div>
      ))}

      {compact ? null : (
        <p className="pt-1 text-[10px] text-ink-muted">
          Bar penuh = mencapai benchmark. Peratus dikira {stages[0]?.basis ?? ''} bagi setiap
          peringkat.
        </p>
      )}
    </div>
  );
}
