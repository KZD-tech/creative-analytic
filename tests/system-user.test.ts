import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { systemUserConfig } from '@/lib/connections/config';
import { describeMetaAdAccount } from '@/lib/connections/meta';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('account ids are normalised to the act_ form Meta expects', () => {
  // People copy the number out of Ads Manager without the prefix.
  withEnv({ META_AD_ACCOUNT_ID: '998877' }, () =>
    assert.deepEqual(systemUserConfig().accountIds, ['act_998877']),
  );
  withEnv({ META_AD_ACCOUNT_ID: 'act_998877' }, () =>
    assert.deepEqual(systemUserConfig().accountIds, ['act_998877']),
  );
});

test('several accounts can be named at once, comma or space separated', () => {
  withEnv({ META_AD_ACCOUNT_ID: '111, act_222  333' }, () =>
    assert.deepEqual(systemUserConfig().accountIds, ['act_111', 'act_222', 'act_333']),
  );
});

test('no account id is not an error — the token gets asked instead', () => {
  withEnv({ META_AD_ACCOUNT_ID: undefined, META_SYSTEM_USER_TOKEN: 'tok' }, () => {
    assert.deepEqual(systemUserConfig().accountIds, []);
    assert.equal(systemUserConfig().token, 'tok');
  });
});

test('describeMetaAdAccount reads the account directly, skipping every listing edge', async () => {
  const calls: URL[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls.push(new URL(String(url)));
    return new Response(
      JSON.stringify({ id: 'act_998877', name: 'IM-1', currency: 'MYR', timezone_name: 'Asia/Kuala_Lumpur' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  const account = await describeMetaAdAccount('token', '998877');
  mock.restoreAll();

  assert.deepEqual(account, {
    id: 'act_998877',
    name: 'IM-1',
    currency: 'MYR',
    timezone: 'Asia/Kuala_Lumpur',
  });
  assert.match(calls[0].pathname, /\/act_998877$/);
  assert.ok(!calls[0].pathname.includes('adaccounts'), 'no listing edge is involved');
});
