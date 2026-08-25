import assert from 'node:assert/strict';
import test from 'node:test';
import { adNameKey, landingKey } from '@/lib/ingest/normalize';

test('adNameKey normalises whitespace and case but keeps punctuation', () => {
  assert.equal(adNameKey('  Rumah Padi  V1H1 '), 'rumah padi v1h1');
  assert.notEqual(adNameKey('V1H1'), adNameKey('V1-H1'));
});

test('landingKey groups by host and path, ignoring tracking parameters', () => {
  assert.equal(landingKey('https://www.derma.com/ramadan?utm_source=fb'), 'derma.com/ramadan');
  assert.equal(landingKey('https://derma.com/ramadan/'), 'derma.com/ramadan');
  assert.equal(landingKey('derma.com/ramadan?fbclid=1'), 'derma.com/ramadan');
  // Two ads pointing at the same page group together even with different UTMs.
  assert.equal(
    landingKey('https://derma.com/ramadan?utm_campaign=a'),
    landingKey('https://derma.com/ramadan?utm_campaign=b'),
  );
  assert.equal(landingKey(null), null);
});
