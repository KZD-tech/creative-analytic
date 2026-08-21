import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  decryptToken,
  encryptToken,
  encryptionConfigured,
  MissingEncryptionKeyError,
} from '@/lib/connections/crypto';

const KEY = randomBytes(32).toString('base64');

function withKey<T>(value: string | undefined, fn: () => T): T {
  const saved = process.env.TOKEN_ENCRYPTION_KEY;
  if (value === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = saved;
  }
}

test('a token survives a round trip unchanged', () => {
  withKey(KEY, () => {
    const token = 'EAABsb1CS...a-very-long-meta-token';
    assert.equal(decryptToken(encryptToken(token)), token);
  });
});

test('the same token encrypts differently every time', () => {
  withKey(KEY, () => {
    // A fresh IV per call, so identical tokens do not produce identical rows —
    // otherwise the table would reveal which accounts share a token.
    const a = encryptToken('same-token');
    const b = encryptToken('same-token');
    assert.notEqual(a, b);
    assert.equal(decryptToken(a), decryptToken(b));
  });
});

test('the ciphertext never contains the plaintext', () => {
  withKey(KEY, () => {
    const token = 'ya29.a0AfH6SMB-secret-refresh-token';
    const payload = encryptToken(token);
    assert.ok(!payload.includes(token));
    assert.ok(!Buffer.from(payload).toString('utf8').includes('secret-refresh'));
  });
});

test('tampering is rejected rather than silently decrypted', () => {
  withKey(KEY, () => {
    const payload = encryptToken('original');
    const [v, iv, tag, body] = payload.split('.');

    // Flip a byte in the ciphertext: GCM's tag must catch it.
    const bytes = Buffer.from(body, 'base64url');
    bytes[0] ^= 0xff;
    const tampered = [v, iv, tag, bytes.toString('base64url')].join('.');

    assert.throws(() => decryptToken(tampered));
  });
});

test('a token encrypted under one key cannot be read with another', () => {
  const payload = withKey(KEY, () => encryptToken('cross-key'));
  withKey(randomBytes(32).toString('base64'), () => {
    assert.throws(() => decryptToken(payload));
  });
});

test('a passphrase key is stretched rather than rejected', () => {
  withKey('bukan-base64-tetapi-satu-frasa-laluan', () => {
    assert.equal(decryptToken(encryptToken('x')), 'x');
  });
});

test('a missing key is a clear error, and is reportable before use', () => {
  withKey(undefined, () => {
    assert.equal(encryptionConfigured(), false);
    assert.throws(() => encryptToken('x'), MissingEncryptionKeyError);
  });
  withKey(KEY, () => assert.equal(encryptionConfigured(), true));
});

test('a malformed stored value fails loudly', () => {
  withKey(KEY, () => {
    for (const bad of ['', 'garbage', 'v2.a.b.c', 'v1.only-two.parts']) {
      assert.throws(() => decryptToken(bad), /tidak dikenali|Unsupported|invalid/i);
    }
  });
});
