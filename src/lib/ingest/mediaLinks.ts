import type { MediaKind } from '@/types/db';

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
