/**
 * Ad names are the join key between independently-sourced streams — ad metrics,
 * donations, creative assets — so matching has to survive stray whitespace and
 * case. It deliberately does NOT strip punctuation — "V1H1" and "V1-H1" are
 * different ads to a media buyer.
 */
export function adNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Groups a destination URL by what actually differs between ads: the host and
 * path. UTM and click-id parameters are stripped, otherwise every ad looks
 * like its own landing page and the report says nothing.
 */
export function landingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const text = url.trim();
  if (!text) return null;

  try {
    const parsed = new URL(text.startsWith('http') ? text : `https://${text}`);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}` || host;
  } catch {
    return text.slice(0, 200);
  }
}
