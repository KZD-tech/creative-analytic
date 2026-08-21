import assert from 'node:assert/strict';
import test from 'node:test';
import { adNameKey, headerKey, toDate, toNumber, toRate, toTimestamp } from '@/lib/ingest/normalize';

test('headerKey collapses Ads Manager column names', () => {
  assert.equal(headerKey('Amount spent (MYR)'), 'amount_spent_myr');
  assert.equal(headerKey('CTR (link click-through rate)'), 'ctr_link_click_through_rate');
  assert.equal(headerKey('  Ad name '), 'ad_name');
});

test('adNameKey normalises whitespace and case but keeps punctuation', () => {
  assert.equal(adNameKey('  Rumah Padi  V1H1 '), 'rumah padi v1h1');
  assert.notEqual(adNameKey('V1H1'), adNameKey('V1-H1'));
});

test('toNumber handles thousands separators, currency and blanks', () => {
  assert.equal(toNumber('1,234.56'), 1234.56);
  assert.equal(toNumber('RM 1 234'), 1234);
  assert.equal(toNumber('1.234,56'), 1234.56);
  assert.equal(toNumber('2.50%'), 2.5);
  assert.equal(toNumber('-'), null);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber(undefined), null);
});

test('toRate reads Meta percentages and hand-written fractions', () => {
  assert.equal(toRate('2.50', 'percent'), 0.025);
  assert.equal(toRate('0.18', 'auto'), 0.18);
  assert.equal(toRate('18', 'auto'), 0.18);
  assert.equal(toRate('', 'auto'), null);
});

test('toDate accepts ISO and day-first formats', () => {
  assert.equal(toDate('2026-03-01'), '2026-03-01');
  assert.equal(toDate('1/3/2026'), '2026-03-01');
  assert.equal(toDate('01-03-2026'), '2026-03-01');
  assert.equal(toDate(''), null);
});

test('toTimestamp resolves wall-clock exports against the campaign timezone', () => {
  // 00:30 in Kuala Lumpur is the previous day in UTC — the case that silently
  // moves donations onto the wrong day if the offset is ignored.
  assert.equal(
    toTimestamp('2026-03-02 00:30:00', 'Asia/Kuala_Lumpur'),
    '2026-03-01T16:30:00.000Z',
  );
  assert.equal(toTimestamp('2026-03-01 10:30:00', 'UTC'), '2026-03-01T10:30:00.000Z');
  assert.equal(
    toTimestamp('2026-03-01T10:30:00+08:00', 'Asia/Kuala_Lumpur'),
    '2026-03-01T02:30:00.000Z',
  );
  assert.equal(toTimestamp('', 'UTC'), null);
});
