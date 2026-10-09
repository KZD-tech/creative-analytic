import assert from 'node:assert/strict';
import test from 'node:test';
import { hintContainsAdName } from '@/lib/db/ingest';

test('a dash-separated campaign shorthand still matches a dash-free hint', () => {
  // Real case: Meta stores "Silungai - V8H1"; the Onpay tracking field
  // reports it back as "Silungai V8H1" (no dash) — this used to fail the
  // containment check, leaving an unrelated same-coded ad on another
  // platform as the only candidate left standing.
  assert.equal(hintContainsAdName('Silungai V8H1', 'Silungai - V8H1'), true);
});

test('a bare dash with no surrounding spaces is still part of the code, not a separator', () => {
  // "V1-H1" and "V1H1" are different ads to a media buyer — this must not
  // start matching them just because the separator rule got added.
  assert.equal(hintContainsAdName('something V1H1 end', 'V1-H1'), false);
  assert.equal(hintContainsAdName('something V1-H1 end', 'V1H1'), false);
});

test('case and extra whitespace around the dash are both tolerated', () => {
  assert.equal(hintContainsAdName('SILUNGAI V8H1', 'silungai - v8h1'), true);
  assert.equal(hintContainsAdName('Silungai  V8H1', 'Silungai  -  V8H1'), true);
});

test('still requires the ad name to actually appear in the hint', () => {
  assert.equal(hintContainsAdName('Tankgaza V3H1', 'Silungai - V8H1'), false);
});
