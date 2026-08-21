import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

const TONES = {
  info: { cls: 'border-line bg-surface-2 text-ink-2', Icon: Info },
  ok: { cls: 'border-good/40 bg-good-soft text-ink', Icon: CheckCircle2 },
  warning: { cls: 'border-warning/50 bg-warning-soft text-ink', Icon: AlertTriangle },
  error: { cls: 'border-critical/50 bg-critical-soft text-ink', Icon: XCircle },
} as const;

/** Status is never carried by colour alone — every notice ships an icon and a label. */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { cls, Icon } = TONES[tone];
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-[12px] leading-relaxed', cls, className)}>
      <Icon size={15} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        <div className={title ? 'mt-0.5' : undefined}>{children}</div>
      </div>
    </div>
  );
}
