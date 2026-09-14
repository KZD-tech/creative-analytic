import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { fetchGoogleAdsCreatives } from '@/lib/connections/googleAds';

/** Each call in sequence gets the next batch; searchStream wraps rows in `results`. */
function stubAds(batches: unknown[][]) {
  let index = 0;
  const bodies: string[] = [];
  mock.method(globalThis, 'fetch', async (_url: string | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    return new Response(JSON.stringify([{ results: batches[index++] ?? [] }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return bodies;
}

test.afterEach(() => mock.restoreAll());

const base = { accessToken: 'tok', developerToken: 'dev', customerId: '1234567890' };

test('a classic video ad resolves its asset to a YouTube embed', async () => {
  stubAds([
    [{ adGroupAd: { ad: { id: '1', name: 'Video A', videoAd: { video: { asset: 'customers/1/assets/9' } } } } }],
    [{ asset: { resourceName: 'customers/1/assets/9', youtubeVideoAsset: { youtubeVideoId: 'abc123' } } }],
  ]);

  const [asset] = await fetchGoogleAdsCreatives(base);
  assert.equal(asset.mediaKind, 'youtube');
  assert.equal(asset.mediaUrl, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(asset.thumbnailUrl, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
});

test('an image ad reads its URL directly, with no second lookup call', async () => {
  const bodies = stubAds([
    [{ adGroupAd: { ad: { id: '2', name: 'Image A', imageAd: { imageUrl: 'https://x.test/a.png' } } } }],
  ]);

  const [asset] = await fetchGoogleAdsCreatives(base);
  assert.equal(asset.mediaKind, 'image');
  assert.equal(asset.mediaUrl, 'https://x.test/a.png');
  assert.equal(bodies.length, 1, 'no asset to resolve, so no second query');
});

test('a responsive display ad resolves its marketing image through the asset lookup', async () => {
  stubAds([
    [{
      adGroupAd: {
        ad: {
          id: '3',
          name: 'Display A',
          responsiveDisplayAd: {
            marketingImages: [{ asset: 'customers/1/assets/5' }],
            headlines: [{ text: 'Bantu Sekarang' }],
            descriptions: [{ text: 'Setiap sumbangan bermakna.' }],
          },
        },
      },
    }],
    [{ asset: { resourceName: 'customers/1/assets/5', imageAsset: { fullSize: { url: 'https://x.test/b.png' } } } }],
  ]);

  const [asset] = await fetchGoogleAdsCreatives(base);
  assert.equal(asset.mediaKind, 'image');
  assert.equal(asset.mediaUrl, 'https://x.test/b.png');
  assert.equal(asset.headline, 'Bantu Sekarang');
  assert.equal(asset.bodyCopy, 'Setiap sumbangan bermakna.');
});

test('a search ad has no media fields and legitimately carries no media', async () => {
  const bodies = stubAds([
    [{ adGroupAd: { ad: { id: '4', name: 'Search A', finalUrls: ['https://x.test/lp'] } } }],
  ]);

  const [asset] = await fetchGoogleAdsCreatives(base);
  assert.equal(asset.mediaKind, 'none');
  assert.equal(asset.mediaUrl, null);
  assert.equal(asset.landingUrl, 'https://x.test/lp');
  assert.equal(bodies.length, 1, 'nothing to resolve');
});

test('a campaign filter is passed through to the ad query', async () => {
  const bodies = stubAds([[]]);
  await fetchGoogleAdsCreatives({ ...base, campaignIds: ['111', '222'] });
  assert.match(bodies[0], /campaign\.id IN \(111,222\)/);
});
