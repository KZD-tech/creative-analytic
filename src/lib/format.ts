const LOCALE = 'ms-MY';

export function money(value: number | null | undefined, currency = 'MYR', decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function moneyCompact(value: number | null | undefined, currency = 'MYR'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 10_000) return money(value, currency);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function num(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1000) return num(value);
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function pct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function multiple(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}x`;
}

export function dayLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/**
 * Without an explicit zone, `toLocaleString` falls back to wherever the code
 * happens to run — the viewer's own machine in a client component, but
 * Vercel's UTC in a server component. The same log row would then show two
 * different times depending only on which rendered it, both silently wrong
 * for anyone reading it in Malaysia. Every campaign here runs on Malaysia
 * time, so that is what a timestamp means regardless of where it renders.
 */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

export function relativeDays(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hari ini';
  if (days === 1) return 'semalam';
  if (days < 30) return `${days} hari lalu`;
  return `${Math.round(days / 30)} bulan lalu`;
}
