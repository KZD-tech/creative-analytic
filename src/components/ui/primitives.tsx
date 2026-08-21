import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      // min-w-0 so a card placed in a grid or flex row can shrink below its
      // content instead of widening the page; long content scrolls or truncates
      // inside the card.
      className={cn('min-w-0 rounded-xl border border-line bg-surface', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-good-soft text-good',
  warning: 'bg-warning-soft text-[color:var(--ink)]',
  serious: 'bg-serious-soft text-[color:var(--ink)]',
  critical: 'bg-critical-soft text-critical',
  neutral: 'bg-neutral-soft text-ink-2',
  accent: 'bg-[color:var(--surface-3)] text-accent',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      {icon ? <div className="text-ink-muted">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children ? <p className="max-w-md text-xs leading-relaxed text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}
