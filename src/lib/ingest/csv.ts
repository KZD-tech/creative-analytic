import Papa from 'papaparse';
import { headerKey } from './normalize';

export interface ParsedCsv {
  rows: Record<string, string>[];
  /** headerKey → original header, for error messages that name what the user sees. */
  headers: Map<string, string>;
  warnings: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const stripped = text.replace(/^﻿/, '');
  const result = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => headerKey(h),
  });

  const headers = new Map<string, string>();
  for (const original of result.meta.fields ?? []) headers.set(original, original);

  const warnings: string[] = [];
  for (const err of result.errors.slice(0, 5)) {
    warnings.push(`Baris ${(err.row ?? 0) + 2}: ${err.message}`);
  }
  if (result.errors.length > 5) {
    warnings.push(`…dan ${result.errors.length - 5} amaran lain.`);
  }

  return { rows: result.data, headers, warnings };
}

/** First present alias wins, so column order in the export does not matter. */
export function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim() !== '') return value;
  }
  return undefined;
}

export function hasAnyColumn(rows: Record<string, string>[], aliases: string[]): boolean {
  const first = rows[0];
  if (!first) return false;
  return aliases.some((alias) => alias in first);
}
