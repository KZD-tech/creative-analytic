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
