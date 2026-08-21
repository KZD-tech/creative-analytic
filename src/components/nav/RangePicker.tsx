'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PRESETS } from '@/lib/window';
import { cn } from '@/lib/cn';

/** One filter row above the content, as the interaction spec calls for. */
export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const active = search.get('range') ?? 'all';

  function select(id: string) {
    const params = new URLSearchParams(search.toString());
    params.delete('from');
    params.delete('to');
    if (id === 'all') params.delete('range');
    else params.set('range', id);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div
      role="group"
      aria-label="Julat tarikh"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
    >
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => select(preset.id)}
          aria-pressed={active === preset.id}
          className={cn(
            'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
            active === preset.id ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
