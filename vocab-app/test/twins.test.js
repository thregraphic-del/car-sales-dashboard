// 👯 Word Twins: the curated file is sound, and keeping groups in «كلماتي» is explicit, grouped, and never duplicates.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';
import { TWINS } from '../public/js/data/twins-data.js';

const db = freshDatabase('lexitube-twins-');
delete process.env.SESSION_SECRET;
let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); });

test('the file: 100 groups of 2–4 words, every word complete, no word twice', () => {
  assert.equal(TWINS.length, 100);
  const seen = new Set();
  for (const g of TWINS) {
    assert.ok(g.words.length >= 2 && g.words.length <= 4, `group ${g.id}`);
    assert.ok(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(g.level));
    for (const w of g.words) {
      assert.ok(w.term && w.ipa.startsWith('/') && w.ar && w.def, `${g.id}:${w.term}`);
      assert.ok(!seen.has(w.term), `duplicate ${w.term}`);
      seen.add(w.term);
    }
  }
});

test('saving: nothing is saved by itself; saving keeps words as they are in the group «المتشابهات», without duplicates', async () => {
  assert.equal((await call('GET', '/api/words')).body.length, 0);
  assert.equal((await call('GET', '/api/groups')).body.length, 0);
  const g1 = TWINS.find((g) => g.words[0].term === 'passed').words.map((w) => ({ term: w.term }));
  const g2 = TWINS.find((g) => g.words[0].term === 'clothes' || g.words[1]?.term === 'clothes').words.map((w) => ({ term: w.term }));
  const r = await call('POST', '/api/twins/save', { groups: [g1, g2] });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, g1.length + g2.length);
  assert.equal(r.body.existed, 0);
  const words = (await call('GET', '/api/words')).body;
  const terms = words.map((w) => w.term).sort();
  assert.deepEqual(terms, [...g1, ...g2].map((x) => x.term).sort(), 'saved as they are (passed stays passed)');
  const passed = words.find((w) => w.term === 'passed');
  assert.ok(passed.arabic || passed.user_arabic, 'the Arabic meaning is saved');
  const groups = (await call('GET', '/api/groups')).body;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'المتشابهات');
  // again: no duplicates
  const r2 = await call('POST', '/api/twins/save', { groups: [g1] });
  assert.equal(r2.body.added, 0);
  assert.equal(r2.body.existed, g1.length);
  assert.equal((await call('GET', '/api/words')).body.length, g1.length + g2.length);
});
