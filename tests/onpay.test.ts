import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { fetchOnpaySalesPage, mapOnpaySale, type OnpaySale } from '@/lib/connections/onpay';

test.afterEach(() => mock.restoreAll());

const baseSale: OnpaySale = {
  id: 347557,
  type: 'donation',
  status: 1,
  total_amount: '50.00',
  confirmed_at: '2026-10-08T20:20:01+08:00',
  created_at: '2026-10-08T20:17:26+08:00',
  invoice_number: 'GYT-AIRBERSIHGAZA347557',
  extra_field_1: '',
  extra_field_2: 'youtube (Returning)',
  extra_field_3: 'W4L |  | tankgaza V3H1',
};

test('a confirmed donation maps with the ad code taken from the last pipe segment', () => {
  const donation = mapOnpaySale(baseSale);
  assert.ok(donation);
  assert.equal(donation.externalId, 'onpay_347557');
  assert.equal(donation.occurredAt, '2026-10-08T20:20:01+08:00');
  assert.equal(donation.amount, 50);
  assert.equal(donation.channel, 'youtube (Returning)');
  assert.equal(donation.attributionRaw, 'W4L |  | tankgaza V3H1');
  assert.equal(donation.adNameHint, 'tankgaza V3H1');
  assert.equal(donation.invoiceNumber, 'GYT-AIRBERSIHGAZA347557');
});

test('a sale that is not type "donation" is dropped — this account also sells ordinary products', () => {
  assert.equal(mapOnpaySale({ ...baseSale, type: 'product' }), null);
});

test('a sale with status 0 (not yet paid) is dropped — confirmed_at alone is not a paid signal', () => {
  assert.equal(mapOnpaySale({ ...baseSale, status: 0 }), null);
});

test('status 0 is dropped even when confirmed_at is set, as real pending rows do carry one', () => {
  assert.equal(mapOnpaySale({ ...baseSale, status: 0, confirmed_at: '2026-10-08T14:04:52+08:00' }), null);
});

test('a paid sale missing confirmed_at falls back to created_at for occurredAt', () => {
  const donation = mapOnpaySale({ ...baseSale, confirmed_at: null });
  assert.ok(donation);
  assert.equal(donation.occurredAt, baseSale.created_at);
});

test('a sale with no tracking field has no ad name hint, not a crash', () => {
  const donation = mapOnpaySale({ ...baseSale, extra_field_3: '' });
  assert.ok(donation);
  assert.equal(donation.adNameHint, null);
});

test('a single pipe segment (no prefix at all) is used as-is', () => {
  const donation = mapOnpaySale({ ...baseSale, extra_field_3: 'V3H1' });
  assert.ok(donation);
  assert.equal(donation.adNameHint, 'V3H1');
});

function stub(body: unknown, status = 200) {
  const calls: URL[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls.push(new URL(String(url)));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

test('fetchOnpaySalesPage authenticates with a token query param and reads sales/record_count', async () => {
  const calls = stub({ ok: true, record_count: 346606, per_page: 1, sales: [baseSale] });

  const { sales, recordCount } = await fetchOnpaySalesPage({
    account: 'ihsanmadani',
    token: 'secret',
    page: 1,
    perPage: 1,
  });

  assert.equal(sales.length, 1);
  assert.equal(sales[0].id, 347557);
  assert.equal(recordCount, 346606);
  assert.equal(calls[0].hostname, 'ihsanmadani.onpay.my');
  assert.equal(calls[0].pathname, '/api/v1/sales.list');
  assert.equal(calls[0].searchParams.get('token'), 'secret');
  assert.equal(calls[0].searchParams.get('per_page'), '1');
});

test('an ok:false response (still HTTP 200) throws with Onpay\'s own message', async () => {
  stub({ ok: false, message: 'Token tidak sah.' });

  await assert.rejects(
    () => fetchOnpaySalesPage({ account: 'ihsanmadani', token: 'bad', page: 1 }),
    /Token tidak sah/,
  );
});
