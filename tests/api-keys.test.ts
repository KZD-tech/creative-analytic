import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKey, hashKey, hashesMatch, keyFromHeader } from '@/lib/api/keys';

test('a generated key is prefixed, long, and unique', () => {
  const a = generateKey();
  const b = generateKey();

  assert.match(a.key, /^ca_live_[A-Za-z0-9_-]{30,}$/);
  assert.notEqual(a.key, b.key);
  assert.notEqual(a.hash, b.hash);
});

test('the stored prefix identifies a key without revealing it', () => {
  const { key, prefix } = generateKey();

  assert.ok(key.startsWith(prefix), 'the prefix is the real start of the key');
  assert.ok(prefix.length < key.length / 2, 'and far too short to be guessed from');
});

test('the hash is what is stored, never the key', () => {
  const { key, hash } = generateKey();

  assert.equal(hash, hashKey(key));
  assert.ok(!hash.includes(key.slice(8)), 'the secret does not survive into the hash');
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('both header forms are accepted', () => {
  const { key } = generateKey();

  // Agent frameworks disagree about the Bearer prefix, and a correct key
  // rejected over that costs an afternoon.
  assert.equal(keyFromHeader(`Bearer ${key}`), key);
  assert.equal(keyFromHeader(`bearer ${key}`), key);
  assert.equal(keyFromHeader(key), key);
  assert.equal(keyFromHeader(`  Bearer   ${key}  `), key);
});

test('anything that is not one of our keys is refused outright', () => {
  assert.equal(keyFromHeader(null), null);
  assert.equal(keyFromHeader(''), null);
  assert.equal(keyFromHeader('Bearer '), null);
  assert.equal(keyFromHeader('Bearer eyJhbGciOi.some.jwt'), null, 'a Supabase JWT is not an API key');
  assert.equal(keyFromHeader('Basic dXNlcjpwYXNz'), null);
});

test('hashes are compared without leaking length or position', () => {
  const { hash } = generateKey();

  assert.ok(hashesMatch(hash, hash));
  assert.ok(!hashesMatch(hash, hashKey('ca_live_something-else')));
  assert.ok(!hashesMatch(hash, hash.slice(0, 20)), 'a differing length is not a match');
});

test('the same key always hashes the same way', () => {
  // Lookup is a single indexed equality, so the hash has to be stable.
  const { key } = generateKey();
  assert.equal(hashKey(key), hashKey(key));
});
