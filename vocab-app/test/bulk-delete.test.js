// 🗑 deleting many words at once (select all → delete) is a few big statements, and removes exactly the chosen ones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';
import { TWINS } from '../public/js/data/twins-data.js';

const db = freshDatabase('lexitube-bulkdel-');
delete process.env.SESSION_SECRET;
let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); });

test('delete 211 words (more than one 200-chunk): all gone; a few chosen: only those', async () => {
  for (let i = 0; i < TWINS.length; i += 12) {
    const r = await call('POST', '/api/twins/save', { groups: TWINS.slice(i, i + 12).map((g) => g.words.map((w) => ({ term: w.term }))) });
    assert.equal(r.status, 200);
  }
  const all = (await call('GET', '/api/words')).body;
  assert.equal(all.length, 211);
  const few = all.slice(0, 3).map((w) => w.uv_id);
  assert.equal((await call('POST', '/api/words/delete', { uv_ids: few })).body.deleted, 3);
  assert.equal((await call('GET', '/api/words')).body.length, 208);
  const rest = (await call('GET', '/api/words')).body.map((w) => w.uv_id);
  assert.equal((await call('POST', '/api/words/delete', { uv_ids: rest })).body.deleted, 208);
  assert.equal((await call('GET', '/api/words')).body.length, 0);
});
