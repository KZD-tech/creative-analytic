import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { exchangeMetaCode, listMetaAdAccounts } from '@/lib/connections/meta';

const INPUT = {
  appId: '123',
  appSecret: 'secret',
  redirectUri: 'https://ihsanku.kaizendigital.my/api/connect/meta/callback',
  code: 'the-code',
};

/** Answers each Graph call in order, and records what was asked. */
function stubGraph(replies: Array<{ status?: number; body: unknown }>) {
  const calls: URL[] = [];
  let index = 0;

  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls.push(new URL(String(url)));
    const reply = replies[index++] ?? { body: { error: { message: 'unexpected call' } } };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  return calls;
}

test.afterEach(() => mock.restoreAll());

test('a system-user token is used as-is and never expires', async () => {
  // Business login with the system-user token type answers without expires_in;
  // there is nothing for fb_exchange_token to extend.
  const calls = stubGraph([{ body: { access_token: 'system-user-token' } }]);

  const token = await exchangeMetaCode(INPUT);

  assert.equal(token.accessToken, 'system-user-token');
  assert.equal(token.expiresAt, null, 'a system-user token has no expiry');
  assert.equal(calls.length, 1, 'the long-lived exchange is skipped entirely');
});

test('expires_in of 0 is treated as non-expiring, not as already expired', async () => {
  stubGraph([{ body: { access_token: 'system-user-token', expires_in: 0 } }]);
  const token = await exchangeMetaCode(INPUT);
  assert.equal(token.expiresAt, null);
});

test('a user token is traded for the long-lived one', async () => {
  const calls = stubGraph([
    { body: { access_token: 'short-token', expires_in: 7200 } },
    { body: { access_token: 'long-token', expires_in: 5_184_000 } },
  ]);

  const token = await exchangeMetaCode(INPUT);

  assert.equal(token.accessToken, 'long-token');
  assert.equal(calls[1].searchParams.get('grant_type'), 'fb_exchange_token');
  assert.equal(calls[1].searchParams.get('fb_exchange_token'), 'short-token');

  const days = (Date.parse(token.expiresAt!) - Date.now()) / 86_400_000;
  assert.ok(days > 59 && days < 61, `about 60 days, got ${days}`);
});

test('a refused exchange keeps the short token rather than failing the connection', async () => {
  stubGraph([
    { body: { access_token: 'short-token', expires_in: 7200 } },
    { status: 400, body: { error: { message: 'Cannot extend this token', code: 100 } } },
  ]);

  const token = await exchangeMetaCode(INPUT);

  assert.equal(token.accessToken, 'short-token');
  assert.ok(token.expiresAt, 'it carries the short token’s own expiry, so renewal is asked for sooner');
  const hours = (Date.parse(token.expiresAt!) - Date.now()) / 3_600_000;
  assert.ok(hours > 1.9 && hours < 2.1, `about two hours, got ${hours}`);
});

test('a failure on the first hop is still an error', async () => {
  // Falling back only makes sense once there is a token to fall back to.
  stubGraph([{ status: 400, body: { error: { message: 'Invalid verification code', code: 100 } } }]);
  await assert.rejects(() => exchangeMetaCode(INPUT), /Invalid verification code/);
});

// ── diagnosing (#200) Missing Permissions ───────────────────────────────────
// Meta names neither the permission nor the token in that error, so the
// listing asks the token what it actually carries before giving up.

test('a #200 is re-reported as the exact permissions the token is missing', async () => {
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { body: { data: [{ permission: 'public_profile', status: 'granted' }] } },
  ]);

  await assert.rejects(
    () => listMetaAdAccounts('token'),
    (error: Error) => {
      assert.match(error.message, /ads_read dan business_management/);
      assert.match(error.message, /Yang ada: public_profile/);
      return true;
    },
  );
});

test('a partially granted token names only what is actually absent', async () => {
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    {
      body: {
        data: [
          { permission: 'ads_read', status: 'granted' },
          { permission: 'business_management', status: 'declined' },
        ],
      },
    },
  ]);

  await assert.rejects(
    () => listMetaAdAccounts('token'),
    (error: Error) => {
      assert.match(error.message, /tidak membawa business_management/);
      assert.ok(!/tidak membawa ads_read/.test(error.message), 'ads_read is granted, so it is not blamed');
      return true;
    },
  );
});

test('when every scope is present the message points at asset assignment instead', async () => {
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    {
      body: {
        data: [
          { permission: 'ads_read', status: 'granted' },
          { permission: 'business_management', status: 'granted' },
        ],
      },
    },
  ]);

  await assert.rejects(
    () => listMetaAdAccounts('token'),
    (error: Error) => {
      assert.match(error.message, /Business Settings/);
      return true;
    },
  );
});

test('the permissions lookup failing leaves the original error intact', async () => {
  // The diagnostic is a convenience; it must never replace the real error.
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { status: 500, body: { error: { message: 'try again later' } } },
  ]);

  await assert.rejects(() => listMetaAdAccounts('token'), /Missing Permissions/);
});

test('errors that are not #200 are passed through untouched', async () => {
  const calls = stubGraph([
    { status: 400, body: { error: { message: 'Invalid OAuth access token', code: 190 } } },
  ]);

  await assert.rejects(() => listMetaAdAccounts('token'), /Invalid OAuth access token/);
  assert.equal(calls.length, 1, 'no permissions lookup for an unrelated failure');
});
