'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, Check } from 'lucide-react';
import { PRESETS } from '@/lib/window';
import { cn } from '@/lib/cn';

const today = () => new Date().toISOString().slice(0, 10);

/** One filter row above the content, as the interaction spec calls for. */
export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  const custom = from !== '' || to !== '';
  const active = custom ? 'custom' : (search.get('range') ?? 'all');

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // A panel that stays open after you have clicked away reads as stuck.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function selectPreset(id: string) {
    const params = new URLSearchParams(search.toString());
    params.delete('from');
    params.delete('to');
    if (id === 'all') params.delete('range');
    else params.set('range', id);
    setOpen(false);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function applyCustom(formData: FormData) {
    const start = String(formData.get('from') ?? '').trim();
    const end = String(formData.get('to') ?? '').trim();
    if (!start && !end) return;

    const params = new URLSearchParams(search.toString());
    params.delete('range');

    // An inverted range returns nothing and looks like missing data, so swap it
    // rather than asking the person to fix their own typo.
    const [lower, upper] = start && end && start > end ? [end, start] : [start, end];
    if (lower) params.set('from', lower);
    else params.delete('from');
    if (upper) params.set('to', upper);
    else params.delete('to');

    setOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    // Wraps rather than overflows: six controls do not fit one phone-width row,
    // and a page that scrolls sideways is worse than a filter on two lines.
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div
        role="group"
        aria-label="Julat tarikh"
        className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface p-0.5"
      >
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => selectPreset(preset.id)}
            aria-pressed={active === preset.id}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
              active === preset.id ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5',
            'text-[12px] font-medium transition-colors',
            custom ? 'bg-surface-3 text-ink' : 'bg-surface text-ink-muted hover:text-ink',
          )}
        >
          <CalendarRange size={14} />
          {custom ? `${from || '…'} → ${to || '…'}` : 'Tarikh tersuai'}
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Pilih julat tarikh"
            className={cn(
              'absolute right-0 z-30 mt-1.5 w-[268px] rounded-xl border border-line',
              'bg-surface p-3 shadow-lg',
            )}
          >
            <form action={applyCustom} className="space-y-2.5">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-muted">Dari</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={from}
                  max={today()}
                  className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-muted">Hingga</span>
                <input
                  type="date"
                  name="to"
                  defaultValue={to}
                  max={today()}
                  className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
                />
              </label>

              <p className="text-[11px] leading-snug text-ink-3">
                Biarkan satu kosong untuk julat terbuka — contohnya “dari 1 Julai” tanpa penghujung.
              </p>

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="submit"
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg',
                    'bg-ink px-3 py-1.5 text-[12px] font-medium text-surface',
                  )}
                >
                  <Check size={14} /> Guna
                </button>
                {custom && (
                  <button
                    type="button"
                    onClick={() => selectPreset('all')}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
                  >
                    Kosongkan
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
