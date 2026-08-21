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
