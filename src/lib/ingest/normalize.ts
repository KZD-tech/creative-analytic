/** Loose header matching: "Amount spent (MYR)" and "amount_spent_myr" collapse to the same key. */
export function headerKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/﻿/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Ad names are the join key between three separate CSV exports, so matching has
 * to survive stray whitespace and case. It deliberately does NOT strip
 * punctuation — "V1H1" and "V1-H1" are different ads to a media buyer.
 */
export function adNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const NUMBER_JUNK = /[^0-9.,\-]/g;

/** Parses "1,234.56", "RM 1 234", "2.50%", "-", "" → number | null. */
export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const text = String(raw).trim();
  if (!text || text === '-' || text === '—' || text.toLowerCase() === 'n/a') return null;

  const cleaned = text.replace(NUMBER_JUNK, '');
  if (!cleaned) return null;

  // "1.234,56" (European) vs "1,234.56" (English): whichever separator comes
  // last is the decimal point.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalised = cleaned;
  if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = cleaned.replace(/,/g, '');
  }

  const value = Number.parseFloat(normalised);
  return Number.isFinite(value) ? value : null;
}

export function toInt(raw: unknown): number | null {
  const value = toNumber(raw);
  return value === null ? null : Math.round(value);
}

/**
 * Meta exports rates as percentages ("2.50" = 2.5%), but hand-built columns such
 * as "Hook Hold Rate" are often already fractions ("0.18"). A value at or below
 * 1 can only be a fraction for a rate, so that is how we read it.
 */
export function toRate(raw: unknown, assume: 'percent' | 'auto'): number | null {
  const value = toNumber(raw);
  if (value === null || value < 0) return null;
  if (assume === 'percent') return value / 100;
  return value <= 1 ? value : value / 100;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;

/** Returns an ISO date string (YYYY-MM-DD) or null. */
export function toDate(raw: unknown): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const iso = ISO_DATE.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = DMY_DATE.exec(text);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Minutes that `timeZone` is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Onpay exports wall-clock time with no offset. Read naively it lands 8 hours
 * off for a Malaysian campaign, which is enough to move donations into the
 * wrong day on every trend chart — so we resolve it against the campaign's
 * timezone.
 */
export function toTimestamp(raw: unknown, timeZone: string): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // Already carries an offset or a Z — trust it.
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const direct = new Date(text);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
  }

  const date = toDate(text);
  if (!date) return null;

  // Dates never contain a colon in any format we accept, so the first
  // colon-bearing group in the string is the time.
  const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  const [y, m, d] = date.split('-').map(Number);
  const hh = time ? Number(time[1]) : 0;
  const mm = time ? Number(time[2]) : 0;
  const ss = time && time[3] ? Number(time[3]) : 0;

  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  // Two passes settle DST boundaries; Malaysia has none, but this keeps the
  // helper correct for campaigns run from zones that do.
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant).toISOString();
}
