import { hasAnyColumn, parseCsv, pick } from './csv';
import { toNumber, toTimestamp } from './normalize';
import type { IngestResult, NormalizedConversion } from './adapter';

const A = {
  id: ['', 'no', 'id', 'receipt', 'resit', 'transaction_id', 'ref'],
  amount: [
    'jumlah_keseluruhan_rm',
    'jumlah_keseluruhan',
    'jumlah',
    'amount',
    'total',
    'total_amount',
  ],
  channel: ['tambahan_2', 'channel', 'saluran', 'source'],
  attribution: ['tambahan_3', 'attribution', 'utm', 'ad_reference'],
  timestamp: [
    'tarikh_masa_dimasukkan',
    'tarikh_masa',
    'tarikh',
    'created_at',
    'date',
    'datetime',
    'timestamp',
  ],
};

export function parseConversionsCsv(
  text: string,
  timeZone: string,
): IngestResult<NormalizedConversion> {
  const { rows, warnings } = parseCsv(text);
  const items: NormalizedConversion[] = [];
  let skipped = 0;

  if (rows.length === 0) {
    return { items, warnings: [...warnings, 'Fail kosong atau tiada baris data.'], skipped: 0 };
  }
  if (!hasAnyColumn(rows, A.amount)) {
    return {
      items,
      warnings: [...warnings, 'Tiada lajur jumlah derma (contoh: "Jumlah Keseluruhan (RM)").'],
      skipped: rows.length,
    };
  }

  let noAttribution = 0;

  for (const row of rows) {
    const amount = toNumber(pick(row, A.amount));
    const occurredAt = toTimestamp(pick(row, A.timestamp), timeZone);

    if (amount === null || occurredAt === null) {
      skipped += 1;
      continue;
    }

    const attribution = pick(row, A.attribution)?.trim() ?? null;
    if (!attribution) noAttribution += 1;

    items.push({
      external_id: pick(row, A.id)?.trim() ?? null,
      occurred_at: occurredAt,
      amount,
      channel: pick(row, A.channel)?.trim() ?? null,
      attribution_raw: attribution,
      ad_name_hint: extractAdName(attribution),
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} baris dilangkau kerana jumlah atau tarikh tidak sah.`);
  }
  if (noAttribution > 0) {
    warnings.push(
      `${noAttribution} derma tiada rujukan iklan — dikira dalam jumlah kempen tetapi tidak boleh diagihkan kepada mana-mana kreatif.`,
    );
  }

  return { items, warnings, skipped };
}

/**
 * Onpay carries attribution as "Campaign | Adset | Ad". The ad name is the last
 * segment; anything with fewer segments is treated as the ad name itself, which
 * is what shows up when a form is wired with a single UTM value.
 */
export function extractAdName(attribution: string | null): string | null {
  if (!attribution) return null;
  const parts = attribution
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}
