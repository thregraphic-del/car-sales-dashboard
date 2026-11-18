// Favourite websites: one small list per learner, only https links, no duplicates.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase();
delete process.env.OPENROUTER_API_KEY;
delete process.env.SESSION_SECRET;

let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

before(async () => { app = await startApp(); });
after(async () => { await app?.close(); db.cleanup(); });

test('nothing saved yet → favs is null', async () => {
  const r = await call('GET', '/api/social/sitefavs');
  assert.equal(r.status, 200);
  assert.equal(r.body.favs, null);
});

test('saves only https links, once each, and gives them back', async () => {
  const r = await call('POST', '/api/social/sitefavs', { favs: ['https://www.bbc.com/news', 'https://www.bbc.com/news', 'http://insecure.example', 'javascript:alert(1)', 42, 'https://ted.com'] });
  assert.equal(r.status, 200);
  const got = await call('GET', '/api/social/sitefavs');
  assert.deepEqual(got.body.favs, ['https://www.bbc.com/news', 'https://ted.com']);
});

test('an empty list clears them', async () => {
  await call('POST', '/api/social/sitefavs', { favs: [] });
  assert.deepEqual((await call('GET', '/api/social/sitefavs')).body.favs, []);
});
