// End-to-end API flow against a fresh temporary database:
// pasted transcript → analysis → save → My Vocabulary → Today → review → campaign.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexitube-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
delete process.env.ANTHROPIC_API_KEY;

let server;
let base;
const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  const { app } = await import('../server/index.js');
  const { seedIfEmpty } = await import('../server/seed.js');
  seedIfEmpty();
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('demo data is present', async () => {
  const { body } = await call('GET', '/api/stats');
  assert.ok(body.total >= 40 && body.total <= 60);
  assert.ok(body.mastered > 0 && body.difficult > 0 && body.due > 0);
  assert.equal((await call('GET', '/api/videos')).body.length, 3);
  assert.ok((await call('GET', '/api/campaigns')).body.length >= 3);
});

test('rejects invalid links with a clear error', async () => {
  const r = await call('POST', '/api/analyze', { url: 'https://example.com' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /YouTube/);
});

test('full learning flow is connected and persistent', async () => {
  const transcript = '0:10 Honestly I was reluctant to quit, but I finally figured it out.\n0:21 We take so much for granted, and we procrastinate on what matters.\n0:33 In the long run, being consistent beats being perfect.\n0:45 Scientists carry out research on sustainable cities, whereas politicians rarely look into it.';
  const a = await call('POST', '/api/analyze', { url: 'https://youtu.be/AAAAAAAAAAA', transcript });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const procr = a.body.items.find((i) => i.term === 'procrastinate');
  assert.ok(procr, 'procrastinate extracted');
  assert.equal(procr.timestamp_seconds, 21);

  const fresh = a.body.items.find((i) => !i.user_state);
  assert.ok(fresh, 'at least one new item');
  const saved = await call('POST', `/api/items/${fresh.video_vocabulary_id}/save`);
  assert.equal(saved.status, 200);
  const uvId = saved.body.uv_id;
  assert.equal(saved.body.video.youtube_id, 'AAAAAAAAAAA');

  const today = await call('GET', '/api/words?section=today');
  assert.ok(today.body.some((w) => w.uv_id === uvId), 'saved word appears in Today section');

  const r1 = await call('POST', '/api/review', { uv_id: uvId, grade: 'hard', source: 'game:fill-blank' });
  assert.equal(r1.body.wrong_count, 1);
  const r2 = await call('POST', '/api/review', { uv_id: uvId, grade: 'good', source: 'flashcard' });
  assert.equal(r2.body.correct_count, 1);
  const detail = await call('GET', `/api/words/${uvId}`);
  assert.equal(detail.body.history.length, 2);

  const camp = await call('POST', '/api/campaigns', { name: 'From test video', source_type: 'video', video_ids: [a.body.video.id], include_unsaved: true });
  assert.equal(camp.status, 200, JSON.stringify(camp.body));
  assert.ok(camp.body.total >= 3);

  const pool = await call('GET', `/api/games/pool?campaign_id=${camp.body.id}`);
  assert.equal(pool.body.words.length, camp.body.total);

  // Re-analysing returns the stored result (no duplicate rows).
  const again = await call('POST', '/api/analyze', { url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' });
  assert.equal(again.body.cached, true);
  assert.equal(again.body.items.length, a.body.items.length);
});

test('today plan is stable and mixes buckets', async () => {
  const p1 = await call('GET', '/api/today');
  const p2 = await call('GET', '/api/today');
  assert.deepEqual(p1.body.items.map((i) => i.uv_id), p2.body.items.map((i) => i.uv_id));
  assert.equal(p1.body.total, 10);
  assert.ok(p1.body.counts.new > 0 && p1.body.counts.review > 0 && p1.body.counts.difficult > 0);
});
