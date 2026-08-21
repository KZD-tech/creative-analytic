import { hasAnyColumn, parseCsv, pick } from './csv';
import type { IngestResult, NormalizedMediaLink } from './adapter';
import type { MediaKind } from '@/types/db';

const A = {
  adName: ['ad_name', 'nama_iklan', 'ad'],
  url: ['youtube_url', 'video_url', 'url', 'media_url', 'link'],
};

export function parseMediaLinksCsv(text: string): IngestResult<NormalizedMediaLink> {
  const { rows, warnings } = parseCsv(text);
  const items: NormalizedMediaLink[] = [];
  let skipped = 0;

  if (!hasAnyColumn(rows, A.adName) || !hasAnyColumn(rows, A.url)) {
    return {
      items,
      warnings: [...warnings, 'Perlu dua lajur: "ad_name" dan "youtube_url".'],
      skipped: rows.length,
    };
  }

  for (const row of rows) {
    const adName = pick(row, A.adName)?.trim();
    const url = pick(row, A.url)?.trim();
    if (!adName || !url) {
      skipped += 1;
      continue;
    }
    items.push({ ad_name: adName, media_url: url });
  }

  if (skipped > 0) warnings.push(`${skipped} baris dilangkau kerana tiada nama iklan atau URL.`);
  return { items, warnings, skipped };
}

const YT_PATTERNS = [
  /youtu\.be\/([\w-]{6,})/,
  /youtube\.com\/watch\?[^#]*\bv=([\w-]{6,})/,
  /youtube\.com\/shorts\/([\w-]{6,})/,
  /youtube\.com\/embed\/([\w-]{6,})/,
];

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const pattern of YT_PATTERNS) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
}

export function classifyMedia(url: string | null | undefined): {
  kind: MediaKind;
  thumbnail: string | null;
} {
  if (!url) return { kind: 'none', thumbnail: null };

  const id = youtubeId(url);
  if (id) return { kind: 'youtube', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };

  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return { kind: 'video', thumbnail: null };
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return { kind: 'image', thumbnail: url };

  return { kind: 'video', thumbnail: null };
}
