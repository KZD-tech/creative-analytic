import type { DateWindow } from '@/lib/db/queries';

export const PRESETS = [
  { id: 'all', label: 'Semua masa', days: null },
  { id: '7d', label: '7 hari', days: 7 },
  { id: '14d', label: '14 hari', days: 14 },
  { id: '30d', label: '30 hari', days: 30 },
  { id: '90d', label: '90 hari', days: 90 },
] as const;

export type PresetId = (typeof PRESETS)[number]['id'];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveWindow(preset: string | undefined, from?: string, to?: string): DateWindow {
  if (from || to) return { from: from ?? null, to: to ?? null };

  const match = PRESETS.find((p) => p.id === preset);
  if (!match || match.days === null) return { from: null, to: null };

  const end = new Date();
  const start = new Date(end.getTime() - (match.days - 1) * 86_400_000);
  return { from: isoDay(start), to: isoDay(end) };
}

/** The equally long window immediately before the current one, for period-over-period. */
export function previousWindow(window: DateWindow): DateWindow | null {
  if (!window.from || !window.to) return null;
  const from = new Date(window.from);
  const to = new Date(window.to);
  const span = to.getTime() - from.getTime() + 86_400_000;
  return {
    from: isoDay(new Date(from.getTime() - span)),
    to: isoDay(new Date(to.getTime() - span)),
  };
}

export function windowLabel(window: DateWindow): string {
  if (!window.from && !window.to) return 'Semua masa';
  if (window.from && window.to) return `${window.from} → ${window.to}`;
  return window.from ? `dari ${window.from}` : `hingga ${window.to}`;
}
