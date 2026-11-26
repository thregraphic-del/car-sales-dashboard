// 🔎 YouTube search: no key → a clear message; results are mapped and saved for a week (the second search does not call Google).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-yt-');
delete process.env.SESSION_SECRET;
delete process.env.OPENROUTER_API_KEY;
delete process.env.YOUTUBE_API_KEY;
let app;
before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); });

test('without a key the route says so (503) and a too-short query is refused', async () => {
  const r = await fetch(`${app.base}/api/youtube/search?q=job%20interview`);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error || '', /غير مفعّل/);
  const s = await fetch(`${app.base}/api/youtube/search?q=a`);
  assert.equal(s.status, 400);
});

test('results are mapped, asked for embeddable + captioned videos, and saved (second search = no call)', async () => {
  const { searchVideos } = await import('../server/routes/youtube.js');
  let calls = 0; let seen = '';
  const fetcher = async (url) => { calls += 1; seen = String(url); return { ok: true, json: async () => ({ nextPageToken: 'NEXT', items: [{ id: { videoId: 'abc123' }, snippet: { title: 'How to ace a job interview', channelTitle: 'Chan', publishedAt: '2024-05-01T10:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' } } } }, { id: {}, snippet: {} }] }) }; };
  const a = await searchVideos('Job Interview', { fetcher, key: 'TEST' });
  assert.equal(a.items.length, 1);
  assert.deepEqual([a.items[0].id, a.items[0].channel, a.items[0].published, a.next], ['abc123', 'Chan', '2024-05-01', 'NEXT']);
  assert.match(seen, /videoEmbeddable=true/);
  assert.match(seen, /videoCaption=closedCaption/);
  const b = await searchVideos('job interview', { fetcher, key: 'TEST' });
  assert.equal(calls, 1, 'saved: Google is not asked again');
  assert.equal(b.items[0].id, 'abc123');
});

test('quota exhausted → a clear message', async () => {
  const { searchVideos } = await import('../server/routes/youtube.js');
  const fetcher = async () => ({ ok: false, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) });
  await assert.rejects(() => searchVideos('other words', { fetcher, key: 'TEST' }), (e) => e.status === 429 || /حصة/.test(e.message));
});
