'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { METRICS, METRIC_IDS, MAX_METRICS, type MetricId } from '@/lib/metrics/catalog';
import { cn } from '@/lib/cn';

export function MetricsPicker({
  selected,
  onChange,
}: {
  selected: MetricId[];
  onChange: (next: MetricId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(id: MetricId) {
    if (selected.includes(id)) {
      // Never leave the grid with nothing to show.
      if (selected.length === 1) return;
      onChange(selected.filter((value) => value !== id));
    } else if (selected.length < MAX_METRICS) {
      onChange([...selected, id]);
    }
  }

  const full = selected.length >= MAX_METRICS;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
      >
        <Plus size={14} strokeWidth={2.5} />
        Metrik ({selected.length})
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-30 mt-1.5 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <p className="px-2 pt-1 pb-2 text-[11px] text-ink-muted">
            Pilih sehingga {MAX_METRICS} metrik. Susunan mengikut urutan anda pilih.
          </p>

          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {METRIC_IDS.map((id) => {
              const on = selected.includes(id);
              const position = selected.indexOf(id) + 1;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    disabled={!on && full}
                    aria-pressed={on}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                      on ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2',
                      !on && full && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border text-[9px] font-bold',
                        on ? 'border-transparent bg-ink text-page' : 'border-line',
                      )}
                    >
                      {on ? position : ''}
                    </span>
                    {METRICS[id].label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
