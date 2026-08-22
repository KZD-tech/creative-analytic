import assert from 'node:assert/strict';
import test from 'node:test';
import { siteUrl } from '@/lib/env';

const KEYS = ['APP_URL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL'] as const;

function withEnv(vars: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('an explicit APP_URL always wins, trailing slashes trimmed', () => {
  withEnv({ APP_URL: 'https://analytics.example.com/', VERCEL_URL: 'dep-abc.vercel.app' }, () => {
    assert.equal(siteUrl(), 'https://analytics.example.com');
  });
  withEnv({ APP_URL: 'https://analytics.example.com///' }, () => {
    assert.equal(siteUrl(), 'https://analytics.example.com');
  });
});

test('production uses the stable domain, not the per-deploy URL', () => {
  // VERCEL_URL changes on every push. Building the redirect from it means the
  // callback falls off the Supabase allowlist as soon as you deploy again.
  withEnv(
    {
      VERCEL_ENV: 'production',
      VERCEL_URL: 'creative-analytic-9f3a2b1.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'creative-analytic.vercel.app',
    },
    () => assert.equal(siteUrl(), 'https://creative-analytic.vercel.app'),
  );
});

test('a preview deployment keeps its own URL', () => {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'creative-analytic-9f3a2b1.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'creative-analytic.vercel.app',
    },
    () => assert.equal(siteUrl(), 'https://creative-analytic-9f3a2b1.vercel.app'),
  );
});

test('local development falls back to localhost', () => {
  withEnv({}, () => assert.equal(siteUrl(), 'http://localhost:3000'));
});

test('APP_URL without a scheme is still a usable origin', () => {
  // Custom domains get typed into the Vercel dashboard by hand, and "https://"
  // is the part people leave off.
  withEnv({ APP_URL: 'ihsanku.kaizendigital.my' }, () =>
    assert.equal(siteUrl(), 'https://ihsanku.kaizendigital.my'),
  );
});

test('APP_URL wins over the Vercel production domain', () => {
  // The custom domain never appears in Vercel's own variables, so this
  // precedence is what makes a custom domain work at all.
  withEnv(
    {
      APP_URL: 'https://ihsanku.kaizendigital.my',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'creative-analytic.vercel.app',
    },
    () => assert.equal(siteUrl(), 'https://ihsanku.kaizendigital.my'),
  );
});

test('a trailing slash never doubles up in a built callback URL', () => {
  withEnv({ APP_URL: 'https://ihsanku.kaizendigital.my/' }, () =>
    assert.equal(`${siteUrl()}/auth/callback`, 'https://ihsanku.kaizendigital.my/auth/callback'),
  );
});
