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

test('deleted words wait in the trash: listed, restored with their group, or removed for good; saving again also brings one back', async () => {
  for (let i = 0; i < 24; i += 12) {
    await call('POST', '/api/twins/save', { groups: TWINS.slice(i, i + 12).map((g) => g.words.map((w) => ({ term: w.term }))) });
  }
  const all = (await call('GET', '/api/words')).body;
  assert.ok(all.length > 20);
  const [a, b, c] = all.slice(0, 3);
  assert.equal((await call('POST', '/api/words/delete', { uv_ids: [a.uv_id, b.uv_id, c.uv_id] })).body.deleted, 3);
  assert.equal((await call('GET', '/api/words')).body.length, all.length - 3);
  const trash = (await call('GET', '/api/words/trash')).body.items;
  const ids = new Set(trash.map((x) => x.uv_id));
  for (const x of [a, b, c]) assert.ok(ids.has(x.uv_id), `${x.term} is in the trash`);
  assert.ok(trash[0].term && trash[0].arabic !== undefined);
  // restore one: back in the list with its groups
  assert.equal((await call('POST', '/api/words/restore', { uv_ids: [a.uv_id] })).body.restored, 1);
  const back = (await call('GET', '/api/words')).body.find((w) => w.uv_id === a.uv_id);
  assert.ok(back && back.group_ids.length >= 1, 'restored with its group');
  // purge one for good
  assert.equal((await call('POST', '/api/words/purge', { uv_ids: [b.uv_id] })).body.purged, 1);
  const left = new Set((await call('GET', '/api/words/trash')).body.items.map((x) => x.uv_id));
  assert.ok(!left.has(b.uv_id) && !left.has(a.uv_id) && left.has(c.uv_id));
  // a purge only touches the trash: a saved word is never removed by it
  assert.equal((await call('POST', '/api/words/purge', { uv_ids: [a.uv_id] })).body.purged, 0);
  // saving the same word again (from a clip, a list…) brings it back from the trash
  const t = trash.find((x) => x.uv_id === c.uv_id).term;
  await call('POST', '/api/twins/save', { groups: [[{ term: t }, { term: 'zzzzword' }]] });
  assert.ok((await call('GET', '/api/words')).body.some((w) => w.uv_id === c.uv_id), 'saving again restores it');
});
