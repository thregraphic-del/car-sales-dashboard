// 🔥 The flame went out: yesterday comes back with a short practice today, or when today's goal was doubled.
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

const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString(); };

test('yesterday missed → the flame is out; no practice today and no doubled goal → refused', async () => {
  const { all, run } = await import('../server/db/index.js');
  const uv = (await all('SELECT id FROM user_vocabulary LIMIT 1'))[0].id;
  const user = (await all('SELECT user_id FROM user_vocabulary WHERE id = ?', uv))[0].user_id;
  await run('DELETE FROM review_logs');
  for (const n of [2, 3, 4]) await run('INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, created_at) VALUES (?,?,?,?,?,?)', user, uv, 'quiz', 'good', 1, dayAgo(n));
  const st = (await call('GET', '/api/stats')).body.streak;
  assert.ok(st.rescue, 'the flame is out');
  assert.equal(st.rescue.lost, 3);
  const refused = await call('POST', '/api/streak/rescue', {});
  assert.equal(refused.status, 400);
});

test('a doubled goal (reported by the device) gives yesterday back without a review today', async () => {
  const r = await call('POST', '/api/streak/rescue', { doubled: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.rescue, null, 'nothing left to rescue');
  assert.equal(r.body.current, 4, 'yesterday plus the 3 days before it');
  const again = await call('POST', '/api/streak/rescue', { doubled: true });
  assert.equal(again.status, 200, 'asking twice is harmless');
});
