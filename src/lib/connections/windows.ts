/**
 * Splits a reporting window into pieces small enough for one request.
 *
 * A month of ad-level daily rows is more than a platform will return before a
 * serverless function runs out of time, and a pull that never completes leaves
 * nothing behind — the next attempt starts from the beginning. Chunking makes
 * each call small; recording what each one covered makes the work cumulative.
 */

export interface Window {
  since: string;
  until: string;
}

export const CHUNK_DAYS = 7;

const DAY = 86_400_000;

export function toDate(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number): string {
  return toIso(toDate(iso) + days * DAY);
}

/**
 * The windows still needed to cover `[since, until]`, given what a connection
 * has already pulled.
 *
 * Ordered newest first on purpose: an interrupted backfill should already have
 * delivered the days people actually look at.
 *
 * `overlapDays` re-pulls that many of the most recent covered days. Meta and
 * Google keep adjusting figures for a few days after the fact, so treating
 * yesterday as finished would freeze numbers that are still moving. Zero means
 * cover each day exactly once.
 */
export function pendingWindows(
  target: Window,
  covered: { from: string | null; through: string | null },
  overlapDays = 3,
): Window[] {
  const targetStart = toDate(target.since);
  const targetEnd = toDate(target.until);
  if (targetEnd < targetStart) return [];

  const windows: Window[] = [];

  const hasCover =
    covered.from !== null &&
    covered.through !== null &&
    toDate(covered.through) >= toDate(covered.from);

  // Nothing pulled yet: the whole target, newest chunk first.
  if (!hasCover) {
    for (let end = targetEnd; end >= targetStart; end -= CHUNK_DAYS * DAY) {
      const start = Math.max(targetStart, end - (CHUNK_DAYS - 1) * DAY);
      windows.push({ since: toIso(start), until: toIso(end) });
    }
    return windows;
  }

  const coveredFrom = toDate(covered.from!);
  const coveredThrough = toDate(covered.through!);

  // 1. The moving edge: everything after what is covered, plus the overlap.
  const refreshFrom = Math.max(targetStart, coveredThrough + DAY - overlapDays * DAY);
  if (refreshFrom <= targetEnd) {
    for (let end = targetEnd; end >= refreshFrom; end -= CHUNK_DAYS * DAY) {
      const start = Math.max(refreshFrom, end - (CHUNK_DAYS - 1) * DAY);
      windows.push({ since: toIso(start), until: toIso(end) });
    }
  }

  // 2. Whatever of the target still sits before the covered range.
  if (coveredFrom > targetStart) {
    for (let end = coveredFrom - DAY; end >= targetStart; end -= CHUNK_DAYS * DAY) {
      const start = Math.max(targetStart, end - (CHUNK_DAYS - 1) * DAY);
      windows.push({ since: toIso(start), until: toIso(end) });
    }
  }

  return windows;
}

/** The covered range after a window has been pulled. */
export function extendCover(
  covered: { from: string | null; through: string | null },
  window: Window,
): { from: string; through: string } {
  const from = covered.from && toDate(covered.from) < toDate(window.since) ? covered.from : window.since;
  const through =
    covered.through && toDate(covered.through) > toDate(window.until) ? covered.through : window.until;
  return { from, through };
}
