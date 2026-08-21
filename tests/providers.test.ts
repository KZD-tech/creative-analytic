import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { enabledProviders } from '@/lib/auth/providers';

/**
 * Cover for a real dead end: the login screen used to offer a Google button
 * unconditionally. On a project where the provider is off, clicking it landed
 * the visitor on raw GoTrue JSON at a Supabase URL — `{"code":400,
 * "error_code":"validation_failed","msg":"Unsupported provider: provider is
 * not enabled"}` — with no way back into the app.
 */
function stubFetch(handler: () => unknown, ok = true) {
  mock.method(globalThis, 'fetch', async () => ({
    ok,
    json: async () => handler(),
  }) as unknown as Response);
}

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };

function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  return fn().finally(() => {
    process.env = saved;
  });
}

test('Google is offered only when Supabase reports it enabled', async () => {
  await withEnv(async () => {
    stubFetch(() => ({ external: { email: true, google: true } }));
    assert.equal((await enabledProviders()).google, true);

    stubFetch(() => ({ external: { email: true, google: false } }));
    assert.equal((await enabledProviders()).google, false);

    // A provider Supabase does not mention at all counts as off.
    stubFetch(() => ({ external: { email: true } }));
    assert.equal((await enabledProviders()).google, false);
  });
  mock.restoreAll();
});

test('when Supabase cannot be reached, Google is hidden but email stays', async () => {
  await withEnv(async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('network down');
    });
    const providers = await enabledProviders();
    assert.equal(providers.google, false, 'never offer a button that may dead-end');
    assert.equal(providers.email, true, 'email is the fallback and must survive');
  });
  mock.restoreAll();
});

test('a non-ok settings response is treated as "cannot tell"', async () => {
  await withEnv(async () => {
    stubFetch(() => ({ external: { google: true } }), false);
    assert.equal((await enabledProviders()).google, false);
  });
  mock.restoreAll();
});

test('without Supabase config there is nothing to ask, and nothing is offered', async () => {
  const saved = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try {
    const providers = await enabledProviders();
    assert.equal(providers.google, false);
    assert.equal(providers.email, true);
  } finally {
    process.env = saved;
  }
});
