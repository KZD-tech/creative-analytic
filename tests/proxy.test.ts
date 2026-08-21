import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

/**
 * Regression cover for a real failure: with Supabase config incomplete, the
 * request used to fall through to a page, `requireUser()` threw deep inside a
 * server component, and React replaced the message with a bare error code in
 * production. The reader saw "Minified React error #441" and had nowhere to go.
 */
function request(path: string): NextRequest {
  return new NextRequest(new Request(`http://localhost:3000${path}`));
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const UNSET = { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined };

test('an unconfigured deploy is rewritten to the setup screen, never left to crash', async () => {
  await withEnv(UNSET, async () => {
    for (const path of ['/', '/c/some-campaign', '/settings/team', '/login']) {
      const response = await proxy(request(path));
      const rewritten = response.headers.get('x-middleware-rewrite');
      assert.ok(rewritten, `${path}: expected a rewrite, got none`);
      assert.equal(new URL(rewritten).pathname, '/setup', `${path} should land on /setup`);
    }
  });
});

test('a missing url alone is enough to divert to setup', async () => {
  await withEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: 'present' }, async () => {
    const response = await proxy(request('/'));
    assert.equal(new URL(response.headers.get('x-middleware-rewrite')!).pathname, '/setup');
  });
});

test('a missing anon key alone is enough to divert to setup', async () => {
  await withEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: undefined }, async () => {
    const response = await proxy(request('/'));
    assert.equal(new URL(response.headers.get('x-middleware-rewrite')!).pathname, '/setup');
  });
});
