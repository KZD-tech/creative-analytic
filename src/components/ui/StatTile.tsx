import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Delta {
  value: number;
  /** Down is good for cost metrics (CPA, CPM), bad for revenue metrics. */
  invert?: boolean;
}

/**
 * A stat tile is the right form when a single number *is* the answer. It carries
 * no plot, so it needs no tooltip — the label and the delta caption say
 * everything the number means.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: Delta | null;
  tone?: 'good' | 'critical' | null;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface px-4 py-3', className)}>
      <div className="text-[11px] font-medium text-ink-muted">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl leading-tight font-semibold',
          tone === 'good' && 'text-good',
          tone === 'critical' && 'text-critical',
        )}
      >
        {value}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
        {delta ? <DeltaChip {...delta} /> : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </div>
    </div>
  );
}

function DeltaChip({ value, invert = false }: Delta) {
  if (!Number.isFinite(value) || value === 0) {
    return <span className="text-ink-muted">tiada perubahan</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 font-semibold', good ? 'text-good' : 'text-critical')}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="tnum">{Math.abs(value * 100).toFixed(0)}%</span>
      <span className="sr-only">{good ? 'lebih baik' : 'lebih teruk'} berbanding tempoh sebelum</span>
    </span>
  );
}
