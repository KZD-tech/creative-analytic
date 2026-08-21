import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Encryption for OAuth tokens before they reach the database.
 *
 * An `ads_read` token is a key to somebody's entire ad account history. Row
 * level security keeps it away from other signed-in users, but that is no help
 * against a leaked backup or a stray query run by whoever holds the
 * service-role key. Encrypting here means the token is only ever plaintext in
 * process memory, and the key lives in the environment rather than the
 * database.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding a plausible-looking wrong token.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'TOKEN_ENCRYPTION_KEY tiada. Jana satu dengan: openssl rand -base64 32',
    );
    this.name = 'MissingEncryptionKeyError';
  }
}

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new MissingEncryptionKeyError();

  // Accept a base64 32-byte key directly; hash anything else to the right
  // length so a passphrase still produces a valid key rather than a crash.
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  return createHash('sha256').update(raw).digest();
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, encrypted] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error('Token tersimpan dalam format yang tidak dikenali.');
  }

  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when a key is configured, so the UI can say so before a connect attempt. */
export function encryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
