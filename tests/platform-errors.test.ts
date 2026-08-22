import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlatformError, needsReauth, readJson } from '../src/lib/connections/http';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const textResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

test('a JSON body is returned as-is', async () => {
  const body = await readJson<{ data: number[] }>(jsonResponse({ data: [1, 2] }), 'Meta');
  assert.deepEqual(body.data, [1, 2]);
});

test('a proxy answering with text names the platform and the status, not a JSON syntax error', async () => {
  // This is what actually reaches the UI when the egress proxy refuses the
  // host: previously it surfaced as `Unexpected token 'H'`.
  await assert.rejects(
    () => readJson(textResponse('Host not in allowlist', 502), 'Meta'),
    (error: PlatformError) => {
      assert.match(error.message, /Meta gagal \(HTTP 502\)/);
      assert.match(error.message, /Host not in allowlist/);
      assert.equal(error.needsReauth, false, 'a gateway failure is not an auth failure');
      return true;
    },
  );
});

test('an HTML error page is flattened rather than dumped', async () => {
  await assert.rejects(
    () => readJson(textResponse(`<html><body><h1>${'x'.repeat(400)}</h1></body></html>`, 503), 'Google Ads'),
    (error: PlatformError) => {
      assert.ok(!error.message.includes('<h1>'), 'tags are stripped');
      assert.ok(error.message.length < 220, `message stayed short: ${error.message.length}`);
      return true;
    },
  );
});

test('a 401 with a non-JSON body does count as needing reauth', async () => {
  await assert.rejects(
    () => readJson(textResponse('Unauthorized', 401), 'Meta'),
    (error: PlatformError) => needsReauth(error),
  );
});

test('needsReauth is false for anything that is not a PlatformError', () => {
  // The old heuristic matched the word "token" anywhere in the message, so a
  // JSON parser complaining about an unexpected token disabled the connection.
  assert.equal(needsReauth(new Error(`Unexpected token 'H', "Host not i"... is not valid JSON`)), false);
  assert.equal(needsReauth(new TypeError('fetch failed')), false);
  assert.equal(needsReauth('boom'), false);
});

test('a successful response that is not JSON is reported as unreadable, not as a failure to reconnect', async () => {
  await assert.rejects(
    () => readJson(textResponse('OK but not json', 200), 'Meta'),
    (error: PlatformError) => {
      assert.match(error.message, /tidak difahami/);
      assert.equal(error.needsReauth, false);
      return true;
    },
  );
});

// ── timeouts ────────────────────────────────────────────────────────────────
// A serverless function that runs out of time reports nothing useful, so a
// hanging platform call has to fail on our own terms first.

test('a hanging call fails with a message naming the platform', async () => {
  const { fetchWithTimeout, PLATFORM_TIMEOUT_MS } = await import('../src/lib/connections/http');
  const original = globalThis.fetch;

  // Reject the way fetch does when its AbortSignal fires.
  globalThis.fetch = (async () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchWithTimeout('https://example.test', {}, 'Meta'),
      (error: PlatformError) => {
        assert.match(error.message, /Meta tidak menjawab/);
        assert.match(error.message, new RegExp(`${PLATFORM_TIMEOUT_MS / 1000} saat`));
        assert.equal(error.needsReauth, false, 'a slow platform is not an auth problem');
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('a network failure keeps its own reason', async () => {
  const { fetchWithTimeout } = await import('../src/lib/connections/http');
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchWithTimeout('https://example.test', {}, 'Google Ads'),
      /Google Ads tidak dapat dihubungi: fetch failed/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
