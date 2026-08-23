import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { fetchMetaCreatives } from '@/lib/connections/meta';

function stubAds(pages: unknown[]) {
  let index = 0;
  const calls: URL[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls.push(new URL(String(url)));
    return new Response(JSON.stringify(pages[index++] ?? { data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

test.afterEach(() => mock.restoreAll());

const fetchFor = (rows: unknown[]) => {
  stubAds([{ data: rows }]);
  return fetchMetaCreatives({ accessToken: 'tok', accountId: '998877' });
};

test('a plain creative gives up its thumbnail, title and body', async () => {
  const [asset] = await fetchFor([
    {
      id: '23850001',
      name: 'Video A — Hook Ibu',
      creative: {
        thumbnail_url: 'https://scontent.test/a.jpg',
        title: 'Bantu Rumah Padi',
        body: 'Setiap RM10 memberi sepinggan nasi.',
      },
    },
  ]);

  assert.equal(asset.externalAdId, '23850001');
  assert.equal(asset.adName, 'Video A — Hook Ibu');
  assert.equal(asset.thumbnailUrl, 'https://scontent.test/a.jpg');
  assert.equal(asset.headline, 'Bantu Rumah Padi');
  assert.equal(asset.bodyCopy, 'Setiap RM10 memberi sepinggan nasi.');
});

test('a story-spec ad hides the same fields one level down', async () => {
  // Most real ads are built this way, so reading only the flat fields leaves
  // the grid blank on a genuine account.
  const [asset] = await fetchFor([
    {
      id: '23850002',
      name: 'Image B',
      creative: {
        image_url: 'https://scontent.test/b.jpg',
        object_story_spec: {
          link_data: {
            name: 'Derma Sekarang',
            message: 'Anak-anak menunggu.',
            link: 'https://ihsanku.my/derma?utm_source=fb',
          },
        },
      },
    },
  ]);

  assert.equal(asset.thumbnailUrl, 'https://scontent.test/b.jpg', 'image_url stands in for a thumbnail');
  assert.equal(asset.headline, 'Derma Sekarang');
  assert.equal(asset.bodyCopy, 'Anak-anak menunggu.');
  assert.equal(asset.landingUrl, 'https://ihsanku.my/derma?utm_source=fb');
});

test('a dynamic asset feed keeps its text in a third place again', async () => {
  const [asset] = await fetchFor([
    {
      id: '23850003',
      name: 'Dynamic C',
      creative: {
        asset_feed_spec: {
          titles: [{ text: 'Sedekah Jariah' }],
          bodies: [{ text: 'Pahala berterusan.' }],
          link_urls: [{ website_url: 'https://ihsanku.my/jariah' }],
        },
      },
    },
  ]);

  assert.equal(asset.headline, 'Sedekah Jariah');
  assert.equal(asset.bodyCopy, 'Pahala berterusan.');
  assert.equal(asset.landingUrl, 'https://ihsanku.my/jariah');
});

test('a video ad reads its link from the call to action', async () => {
  const [asset] = await fetchFor([
    {
      id: '23850004',
      name: 'Video D',
      creative: {
        object_story_spec: {
          video_data: {
            title: 'Kisah Pak Mat',
            message: 'Tiga minit yang mengubah.',
            call_to_action: { value: { link: 'https://ihsanku.my/pakmat' } },
          },
        },
      },
    },
  ]);

  assert.equal(asset.headline, 'Kisah Pak Mat');
  assert.equal(asset.landingUrl, 'https://ihsanku.my/pakmat');
});

test('an ad with no creative at all still yields a usable row', async () => {
  const [asset] = await fetchFor([{ id: '23850005', name: 'Bare' }]);

  assert.equal(asset.externalAdId, '23850005');
  assert.equal(asset.thumbnailUrl, null);
  assert.equal(asset.headline, null);
});

test('an unnamed ad falls back to its id rather than an empty label', async () => {
  const [asset] = await fetchFor([{ id: '23850006' }]);
  assert.equal(asset.adName, '23850006');
});

test('the account id is normalised and named campaigns are filtered', async () => {
  const calls = stubAds([{ data: [] }]);
  await fetchMetaCreatives({ accessToken: 'tok', accountId: '998877', campaignIds: ['111', '222'] });

  assert.match(calls[0].pathname, /\/act_998877\/ads$/);
  const filtering = JSON.parse(calls[0].searchParams.get('filtering')!);
  assert.deepEqual(filtering, [{ field: 'campaign.id', operator: 'IN', value: ['111', '222'] }]);
});

test('paging is followed to the end', async () => {
  stubAds([
    { data: [{ id: '1', name: 'One' }], paging: { next: 'https://graph.facebook.com/next-page' } },
    { data: [{ id: '2', name: 'Two' }] },
  ]);

  const assets = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });
  assert.deepEqual(assets.map((a) => a.externalAdId), ['1', '2']);
});

// ── page size ───────────────────────────────────────────────────────────────
// These fields nest three deep, and Meta weighs a page by fields × rows.

test('Meta refusing the page size makes it smaller and try again', async () => {
  const calls: URL[] = [];
  let attempt = 0;

  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const parsed = new URL(String(url));
    calls.push(parsed);
    attempt += 1;

    if (attempt === 1) {
      return new Response(
        JSON.stringify({
          error: { message: "Please reduce the amount of data you're asking for, then retry your request", code: 1 },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ data: [{ id: '1', name: 'One' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const assets = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });

  const first = Number(calls[0].searchParams.get('limit'));
  const second = Number(calls[1].searchParams.get('limit'));
  assert.ok(second < first, `page size shrank: ${first} → ${second}`);
  assert.deepEqual(assets.map((a) => a.externalAdId), ['1']);
});

test('shrinking part-way through a listing does not read the first ads twice', async () => {
  // The retry restarts from page one, so anything already collected has to go.
  let attempt = 0;

  mock.method(globalThis, 'fetch', async () => {
    attempt += 1;
    const ok = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

    // First pass: page 1 succeeds, page 2 is refused.
    if (attempt === 1) return ok({ data: [{ id: '1' }], paging: { next: 'https://graph.facebook.com/p2' } });
    if (attempt === 2) {
      return new Response(
        JSON.stringify({ error: { message: "Please reduce the amount of data you're asking for", code: 1 } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    // Second pass at the smaller size, in one page.
    return ok({ data: [{ id: '1' }, { id: '2' }] });
  });

  const assets = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });

  assert.deepEqual(assets.map((a) => a.externalAdId), ['1', '2'], 'no duplicate of ad 1');
});

test('an error that is not about page size is not retried', async () => {
  let attempts = 0;
  mock.method(globalThis, 'fetch', async () => {
    attempts += 1;
    return new Response(
      JSON.stringify({ error: { message: '(#190) Invalid OAuth access token', code: 190 } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  });

  await assert.rejects(() => fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' }), /Invalid OAuth/);
  assert.equal(attempts, 1, 'shrinking the page would not help here');
});

// ── video and poster assets ─────────────────────────────────────────────────
// The still and the playable asset are different things, and conflating them
// made every poster render at preview size and every video render as a picture.

test('a poster keeps the full image, not the tiny preview Meta generates', async () => {
  const [asset] = await fetchFor([
    {
      id: '1',
      name: 'Poster',
      creative: {
        thumbnail_url: 'https://scontent.test/tiny_64x64.jpg',
        image_url: 'https://scontent.test/full.jpg',
      },
    },
  ]);

  assert.equal(asset.mediaUrl, 'https://scontent.test/full.jpg', 'the grid shows the real image');
  assert.equal(asset.thumbnailUrl, 'https://scontent.test/tiny_64x64.jpg');
  assert.equal(asset.mediaKind, 'image');
});

test('a video ad is labelled a video and carries the playable file', async () => {
  let call = 0;
  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    call += 1;
    const parsed = new URL(String(url));
    const body =
      call === 1
        ? {
            data: [
              {
                id: '1',
                name: 'Video A',
                creative: {
                  object_story_spec: {
                    video_data: { video_id: 'vid_9', image_url: 'https://scontent.test/still.jpg' },
                  },
                },
              },
            ],
          }
        : { vid_9: { source: 'https://video.test/vid_9.mp4', picture: 'https://scontent.test/pic.jpg' } };

    if (call === 2) {
      assert.equal(parsed.searchParams.get('ids'), 'vid_9', 'videos are read by id');
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const [asset] = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });

  assert.equal(asset.mediaKind, 'video');
  assert.equal(asset.mediaUrl, 'https://video.test/vid_9.mp4');
  assert.equal(asset.thumbnailUrl, 'https://scontent.test/still.jpg', 'the creative still wins');
});

test('several videos are read in one batched call', async () => {
  const calls: URL[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const parsed = new URL(String(url));
    calls.push(parsed);
    const body = calls.length === 1
      ? {
          data: [
            { id: '1', creative: { video_id: 'v1' } },
            { id: '2', creative: { video_id: 'v2' } },
            { id: '3', creative: { video_id: 'v3' } },
          ],
        }
      : { v1: { source: 's1' }, v2: { source: 's2' }, v3: { source: 's3' } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const assets = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });

  assert.equal(calls.length, 2, 'one listing, one batch — not one call per video');
  assert.deepEqual(assets.map((a) => a.mediaUrl), ['s1', 's2', 's3']);
});

test('a video whose file cannot be read stays a video', async () => {
  // Mislabelling it an image would put a broken <img> where a player belongs.
  let call = 0;
  mock.method(globalThis, 'fetch', async () => {
    call += 1;
    if (call === 1) {
      return new Response(
        JSON.stringify({
          data: [{ id: '1', creative: { object_story_spec: { video_data: { video_id: 'vid_9', image_url: 'https://scontent.test/still.jpg' } } } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ error: { message: 'no access to this video', code: 100 } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  });

  const [asset] = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });

  assert.equal(asset.mediaKind, 'video');
  assert.equal(asset.mediaUrl, null);
  assert.equal(asset.thumbnailUrl, 'https://scontent.test/still.jpg', 'a poster beats a black tile');
});

test('a dynamic feed video is found too', async () => {
  let call = 0;
  mock.method(globalThis, 'fetch', async () => {
    call += 1;
    const body = call === 1
      ? { data: [{ id: '1', creative: { asset_feed_spec: { videos: [{ video_id: 'v7', thumbnail_url: 'https://t.test/7.jpg' }] } } }] }
      : { v7: { source: 'https://video.test/7.mp4' } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const [asset] = await fetchMetaCreatives({ accessToken: 'tok', accountId: 'act_1' });

  assert.equal(asset.mediaKind, 'video');
  assert.equal(asset.mediaUrl, 'https://video.test/7.mp4');
});

test('an ad with no asset at all is marked as having none', async () => {
  const [asset] = await fetchFor([{ id: '1', name: 'Bare' }]);
  assert.equal(asset.mediaKind, 'none');
  assert.equal(asset.mediaUrl, null);
});
