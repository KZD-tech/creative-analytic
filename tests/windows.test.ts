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
