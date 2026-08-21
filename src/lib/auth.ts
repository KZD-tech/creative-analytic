/**
 * A single shared password, not a user system. It exists so a deployed
 * dashboard is not simply public — Supabase itself is never reachable from the
 * browser, so this is the only door.
 *
 * Uses Web Crypto so the same helper runs in middleware and in server actions.
 */
export const SESSION_COOKIE = 'ca_session';

export async function sessionToken(password: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a wrong password leaks nothing through timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
