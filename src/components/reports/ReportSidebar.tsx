'use client';

import { REPORTS, type ReportId } from '@/lib/reports';
import { cn } from '@/lib/cn';

export function ReportSidebar({
  active,
  counts,
  onSelect,
}: {
  active: ReportId;
  /** How many rows each report would show, so empty ones read as unavailable. */
  counts: Record<ReportId, number>;
  onSelect: (id: ReportId) => void;
}) {
  return (
    <nav aria-label="Laporan templat" className="lg:w-56 lg:shrink-0">
      <h2 className="mb-2 px-2 text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
        Laporan Templat
      </h2>

      <ul className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
        {REPORTS.map((report) => {
          const count = counts[report.id] ?? 0;
          const empty = count === 0;
          const selected = active === report.id;

          return (
            <li key={report.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onSelect(report.id)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  selected ? 'bg-surface-3' : 'hover:bg-surface-2',
                  // Empty reports stay clickable — the screen then explains what
                  // data is missing, which is more useful than a dead link.
                  empty && !selected && 'opacity-45',
                )}
              >
                <span aria-hidden className="mt-px text-[15px] leading-none">
                  {report.icon}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-[13px] font-medium whitespace-nowrap lg:whitespace-normal',
                      selected ? 'text-ink' : 'text-ink-2',
                    )}
                  >
                    {report.label}
                  </span>
                  <span className="hidden text-[11px] text-ink-muted lg:block">
                    {empty ? 'Tiada data lagi' : report.blurb}
                  </span>
                </span>
                {!empty ? (
                  <span className="tnum ml-auto hidden text-[11px] text-ink-muted lg:block">{count}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
