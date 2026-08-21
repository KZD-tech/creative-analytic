'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/cn';

const VARIANTS = {
  primary: 'bg-ink text-page hover:opacity-90',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border border-critical text-critical hover:bg-critical-soft',
} as const;

const SIZES = {
  sm: 'px-2.5 py-1 text-[12px]',
  md: 'px-3.5 py-2 text-[13px]',
} as const;

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/** Disables itself while the enclosing form action is in flight. */
export function SubmitButton({
  children,
  pendingLabel = 'Menghantar…',
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
