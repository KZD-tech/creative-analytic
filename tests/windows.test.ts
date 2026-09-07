import assert from 'node:assert/strict';
import test from 'node:test';
import { CHUNK_DAYS, extendCover, pendingWindows, shiftDays } from '@/lib/connections/windows';

const TARGET = { since: '2026-07-24', until: '2026-08-22' }; // 30 days
const NOTHING = { from: null, through: null };

const spans = (windows: { since: string; until: string }[]) =>
  windows.map((w) => `${w.since}..${w.until}`);

test('a first pull is split into chunks, newest first', () => {
  const windows = pendingWindows(TARGET, NOTHING);

  assert.equal(windows[0].until, '2026-08-22', 'the days people look at come first');
  assert.ok(windows.length >= 4, `30 days needs several ${CHUNK_DAYS}-day chunks, got ${windows.length}`);

  for (const w of windows) {
    const days = (Date.parse(w.until) - Date.parse(w.since)) / 86_400_000 + 1;
    assert.ok(days <= CHUNK_DAYS, `${w.since}..${w.until} is ${days} days`);
  }
});

test('the chunks cover the target exactly, with no gaps and no overlap', () => {
  const windows = [...pendingWindows(TARGET, NOTHING)].reverse();

  assert.equal(windows[0].since, TARGET.since);
  assert.equal(windows.at(-1)!.until, TARGET.until);

  for (let i = 1; i < windows.length; i += 1) {
    assert.equal(
      windows[i].since,
      shiftDays(windows[i - 1].until, 1),
      `gap or overlap between ${spans([windows[i - 1]])} and ${spans([windows[i]])}`,
    );
  }
});

test('an already-covered range only re-pulls the days still moving', () => {
  // Platforms keep adjusting recent figures, so the last few days are refetched
  // even though they are nominally covered.
  const windows = pendingWindows(TARGET, { from: '2026-07-24', through: '2026-08-22' });

  assert.equal(windows.length, 1, 'one small window, not the whole month');
  assert.equal(windows[0].until, '2026-08-22');
  assert.equal(windows[0].since, '2026-08-20', 'the last three covered days are redone');
});

test('an interrupted backfill resumes where it stopped', () => {
  // A first attempt got the newest two weeks before running out of time.
  const windows = pendingWindows(TARGET, { from: '2026-08-09', through: '2026-08-22' });
  const earliest = windows.at(-1)!;

  assert.equal(earliest.since, '2026-07-24', 'it reaches back to the start of the target');
  assert.ok(
    windows.some((w) => w.until === '2026-08-08'),
    'and picks up immediately before what was already covered',
  );
});

test('nothing is pending once the target is covered and there is no overlap to redo', () => {
  assert.deepEqual(pendingWindows(TARGET, { from: '2026-07-24', through: '2026-08-22' }, 0), []);
});

test('a covered range wider than the target asks for nothing beyond it', () => {
  const windows = pendingWindows(TARGET, { from: '2026-01-01', through: '2026-08-22' }, 0);
  assert.deepEqual(windows, []);
});

test('extendCover grows the range in both directions and never shrinks it', () => {
  assert.deepEqual(extendCover(NOTHING, { since: '2026-08-16', until: '2026-08-22' }), {
    from: '2026-08-16',
    through: '2026-08-22',
  });

  assert.deepEqual(
    extendCover({ from: '2026-08-16', through: '2026-08-22' }, { since: '2026-08-09', until: '2026-08-15' }),
    { from: '2026-08-09', through: '2026-08-22' },
  );

  // Re-pulling the overlap must not pull `through` backwards.
  assert.deepEqual(
    extendCover({ from: '2026-08-09', through: '2026-08-22' }, { since: '2026-08-19', until: '2026-08-21' }),
    { from: '2026-08-09', through: '2026-08-22' },
  );
});

test('an inverted target asks for nothing', () => {
  assert.deepEqual(pendingWindows({ since: '2026-08-22', until: '2026-07-24' }, NOTHING), []);
});

// ── the cron endpoint is shut without a secret ──────────────────────────────

test('the scheduled sync refuses a request with no secret configured', async () => {
  // Failing closed matters more here than anywhere else: this route runs as the
  // service role, outside any user session.
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  try {
    const { GET } = await import('@/app/api/sync/cron/route');
    const response = await GET(
      new Request('https://ihsanku.kaizendigital.my/api/sync/cron', {
        headers: { authorization: 'Bearer anything' },
      }) as never,
    );
    assert.equal(response.status, 401);
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  }
});

test('the scheduled sync refuses a wrong secret', async () => {
  const saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'the-real-secret';

  try {
    const { GET } = await import('@/app/api/sync/cron/route');
    for (const header of ['', 'Bearer wrong', 'the-real-secret', 'Bearer the-real-secretX']) {
      const response = await GET(
        new Request('https://ihsanku.kaizendigital.my/api/sync/cron', {
          headers: { authorization: header },
        }) as never,
      );
      assert.equal(response.status, 401, `accepted ${JSON.stringify(header)}`);
    }
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  }
});

// ── the time budget ─────────────────────────────────────────────────────────

test('the creative pull gets its own reserve, so it never starts with no time left', async () => {
  // It used to run after the metrics loop had spent the whole budget, and a
  // single Graph call can take twenty seconds — enough to push the function
  // past its limit and return a gateway error instead of a response.
  const source = await import('../src/lib/connections/sync');
  const text = (await import('node:fs')).readFileSync('src/lib/connections/sync.ts', 'utf8');

  assert.ok(source.DEFAULT_LOOKBACK_DAYS > 0);
  assert.match(text, /metricsDeadline = started \+ BUDGET_MS - CREATIVE_RESERVE_MS/);
  assert.match(text, /Date\.now\(\) < overallDeadline/, 'the creative pull checks the clock first');

  const budget = Number(/const BUDGET_MS = ([\d_]+)/.exec(text)![1].replace(/_/g, ''));
  const reserve = Number(/const CREATIVE_RESERVE_MS = ([\d_]+)/.exec(text)![1].replace(/_/g, ''));

  assert.ok(reserve > 0 && reserve < budget, 'the reserve is a slice of the budget, not all of it');
  // maxDuration on the Data page is 60s; the whole budget must fit inside it
  // with room for the write that follows.
  assert.ok(budget <= 50_000, `budget ${budget}ms leaves margin under the 60s limit`);
});

test('a creative listing stops paging once its deadline passes', async () => {
  const { fetchMetaCreatives } = await import('@/lib/connections/meta');
  const { mock } = await import('node:test');

  let pages = 0;
  mock.method(globalThis, 'fetch', async () => {
    pages += 1;
    return new Response(
      JSON.stringify({ data: [{ id: String(pages) }], paging: { next: 'https://graph.facebook.com/next' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  try {
    // A deadline already in the past: one page is fetched, then it gives up.
    const assets = await fetchMetaCreatives({
      accessToken: 'tok',
      accountId: 'act_1',
      deadline: Date.now() - 1,
    });
    assert.equal(pages, 1, 'it does not keep paging into the timeout');
    assert.equal(assets.length, 1, 'and returns what it did get');
  } finally {
    mock.restoreAll();
  }
});

// ── the scheduled pull ──────────────────────────────────────────────────────

test('the cron fires every 2 hours, anchored at the top of the hour', async () => {
  // A single once-nightly firing used to have to land after the previous day
  // was complete in Malaysia time. Firing every 2 hours drops that
  // requirement entirely — pendingWindows()'s overlapDays re-pulls the last 3
  // days on every call, so an intraday run just refines numbers that are
  // still moving rather than needing the day to be "done" first. What still
  // matters is that it targets the right endpoint and actually repeats
  // through the day instead of firing once.
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const [job] = config.crons;

  assert.equal(job.path, '/api/sync/cron');

  const [minute, hour] = job.schedule.split(' ');
  assert.equal(minute, '0', 'should fire on the hour, not some arbitrary minute');
  assert.match(hour, /^\*\/\d+$/, 'should be a "every N hours" step, not a single fixed hour');

  const stepHours = Number(hour.slice(2));
  const firingsPerDay = 24 / stepHours;
  assert.ok(
    Number.isInteger(firingsPerDay) && firingsPerDay >= 6,
    `fires ${firingsPerDay} times a day at a ${stepHours}h step — expected an interval that divides evenly into a day and refreshes at least every 4h`,
  );
});

test('the lookback reaches back far enough to be worth backfilling', async () => {
  const { DEFAULT_LOOKBACK_DAYS } = await import('@/lib/connections/sync');
  assert.ok(DEFAULT_LOOKBACK_DAYS >= 90, `got ${DEFAULT_LOOKBACK_DAYS} days`);
});

test('a long lookback is still cut into small chunks', () => {
  // The window is a target, not a single request: 180 days must not become one
  // enormous call that times out.
  const target = { since: '2026-02-24', until: '2026-08-22' };
  const windows = pendingWindows(target, { from: null, through: null });

  assert.ok(windows.length > 20, `${windows.length} chunks for 180 days`);
  for (const w of windows) {
    const days = (Date.parse(w.until) - Date.parse(w.since)) / 86_400_000 + 1;
    assert.ok(days <= CHUNK_DAYS, `${w.since}..${w.until} is ${days} days`);
  }
  assert.equal(windows[0].until, target.until, 'the newest days still come first');
});
