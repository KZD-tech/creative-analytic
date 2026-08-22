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

// ── finding the ad accounts ─────────────────────────────────────────────────
// Which Graph edge answers depends on the kind of token, and Meta's refusal
// when you ask the wrong one says nothing about the endpoint being wrong.

const APP = { appId: '123', appSecret: 'secret' };

test('a user token is served by /me/adaccounts', async () => {
  const calls = stubGraph([
    { body: { data: [{ id: 'act_1', name: 'Rumah Padi', currency: 'MYR', timezone_name: 'Asia/Kuala_Lumpur' }] } },
  ]);

  const accounts = await listMetaAdAccounts('token', APP);

  assert.deepEqual(accounts, [
    { id: 'act_1', name: 'Rumah Padi', currency: 'MYR', timezone: 'Asia/Kuala_Lumpur' },
  ]);
  assert.equal(calls.length, 1, 'the second edge is not tried once the first answers');
});

test('a system-user token falls through to /me/assigned_ad_accounts', async () => {
  // The reason the whole flow was failing: /me/adaccounts is a User edge, and a
  // system-user token resolves /me to a system user.
  const calls = stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { body: { data: [{ id: 'act_9', name: 'IhsanKu', currency: 'MYR' }] } },
  ]);

  const accounts = await listMetaAdAccounts('token', APP);

  assert.equal(accounts[0].id, 'act_9');
  assert.match(calls[1].pathname, /assigned_ad_accounts$/);
});

test('an empty first edge is not mistaken for an answer', async () => {
  const calls = stubGraph([
    { body: { data: [] } },
    { body: { data: [{ id: 'act_9', name: 'IhsanKu' }] } },
  ]);

  const accounts = await listMetaAdAccounts('token', APP);

  assert.equal(accounts[0].id, 'act_9');
  assert.equal(calls.length, 2);
});

test('a system-user token with no assets is told to assign them, not to fix permissions', async () => {
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { body: { data: { type: 'SYSTEM_USER', scopes: ['ads_read'] } } },
  ]);

  await assert.rejects(
    () => listMetaAdAccounts('token', APP),
    (error: Error) => {
      assert.match(error.message, /System users/);
      assert.match(error.message, /Assign assets/);
      assert.ok(!/permission dalam configuration/.test(error.message), 'does not blame the login config');
      return true;
    },
  );
});

test('a user token genuinely lacking the scope is told so', async () => {
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { body: { data: { type: 'USER', scopes: ['public_profile', 'pages_show_list'] } } },
  ]);

  await assert.rejects(
    () => listMetaAdAccounts('token', APP),
    (error: Error) => {
      assert.match(error.message, /tidak membawa ads_read/);
      assert.match(error.message, /public_profile, pages_show_list/);
      return true;
    },
  );
});

test('a user token that can read but sees nothing points at asset access', async () => {
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { body: { data: { type: 'USER', scopes: ['ads_management'] } } },
  ]);

  await assert.rejects(
    () => listMetaAdAccounts('token', APP),
    (error: Error) => {
      assert.match(error.message, /Business Settings/);
      assert.ok(!/tidak membawa/.test(error.message), 'ads_management already covers reading');
      return true;
    },
  );
});

test('without an app credential the original Graph error survives', async () => {
  // debug_token needs the app secret; with none, inventing a diagnosis would be
  // worse than showing what Meta actually said.
  stubGraph([
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
    { status: 400, body: { error: { message: '(#200) Missing Permissions', code: 200 } } },
  ]);

  await assert.rejects(() => listMetaAdAccounts('token'), /Missing Permissions/);
});
