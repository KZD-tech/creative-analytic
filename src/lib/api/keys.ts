import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Keys for machine callers.
 *
 * The prefix is not decoration: a list of keys is unusable if every row looks
 * the same, and showing the first characters lets someone recognise which key
 * an agent is using without the key itself ever being readable again.
 */

const PREFIX = 'ca_live_';

export interface GeneratedKey {
  /** Shown once, at creation. Never recoverable afterwards. */
  key: string;
  hash: string;
  prefix: string;
}

export function generateKey(): GeneratedKey {
  const secret = randomBytes(24).toString('base64url');
  const key = `${PREFIX}${secret}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, PREFIX.length + 6) };
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Pulls the key out of an Authorization header.
 *
 * Both forms are accepted because agent frameworks disagree about which one
 * they send, and a rejected key that is actually correct is the kind of failure
 * that costs an afternoon.
 */
export function keyFromHeader(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(trimmed);
  const value = bearer ? bearer[1].trim() : trimmed;
  return value.startsWith(PREFIX) ? value : null;
}

/** Constant-time comparison, for anywhere two hashes are checked directly. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
