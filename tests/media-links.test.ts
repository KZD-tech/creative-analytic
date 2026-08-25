import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMedia, youtubeId } from '@/lib/ingest/mediaLinks';

test('youtubeId reads the id out of every URL shape Meta creatives use', () => {
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/shorts/abc123XYZ'), 'abc123XYZ');
  assert.equal(youtubeId('https://cdn.example.com/a.mp4'), null);
  assert.equal(youtubeId(null), null);
});

test('classifyMedia sorts a URL into youtube, video, image or none', () => {
  assert.equal(classifyMedia('https://youtu.be/dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(classifyMedia('https://cdn.example.com/a.mp4').kind, 'video');
  assert.equal(classifyMedia('https://cdn.example.com/a.jpg').kind, 'image');
  assert.equal(classifyMedia(null).kind, 'none');
});
