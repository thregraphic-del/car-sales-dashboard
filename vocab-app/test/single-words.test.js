// 🔤 The list holds single words only: a multi-word item is split into its single words, never twice.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-single-'); // the database modules are loaded AFTER this (they read the path at load)
const { run, insert, get } = await import('../server/db/index.js');
const { isSingleWord } = await import('../server/services/extractor.js');
delete process.env.SESSION_SECRET;
delete process.env.OPENROUTER_API_KEY;
let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); });

test('what counts as one word', () => {
  for (const w of ['system', 'well-known', "o'clock"]) assert.ok(isSingleWord(w), w);
  for (const w of ['nervous system', 'give up', '', 'a b', '12']) assert.ok(!isSingleWord(w), w);
});

test('multi-word items become single words; existing words are not duplicated; AI is not needed once decided', async () => {
  await call('GET', '/api/words'); // the local learner is created on the first request
  const uid = 1;
  const addVocab = async (term, key, arabic = 'معنى', level = 'B1') => (await get('SELECT id FROM vocabulary WHERE match_key = ?', key))?.id || insert('INSERT INTO vocabulary (term, match_key, item_type, level, arabic) VALUES (?,?,?,?,?)', term, key, term.includes(' ') ? 'expression' : 'word', level, arabic);
  const save = async (vid) => { await run("INSERT INTO user_vocabulary (user_id, vocabulary_id, state, saved_at) VALUES (?,?, 'saved', ?) ON CONFLICT (user_id, vocabulary_id) DO UPDATE SET state = 'saved'", uid, vid, new Date().toISOString()); };
  const sys = (await get('SELECT id FROM vocabulary WHERE match_key = ?', 'system'))?.id || await addVocab('system', 'system');
  await save(sys);
  await save(await addVocab('nervous system', 'nervous system'));
  await save(await addVocab('personal growth', 'personal growth'));
  const decide = (term, d) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `tidy3:${term}`, JSON.stringify(d));
  await decide('nervous system', { base: 'system', arabic: 'نظام', level: 'B1', others: [{ word: 'nervous', arabic: 'عصبي', level: 'B2' }] });
  await decide('personal growth', { base: 'growth', arabic: 'نمو', level: 'B1', others: [{ word: 'personal', arabic: 'شخصي', level: 'A2' }] });
  const r = await call('POST', '/api/words/tidy', {});
  assert.equal(r.status, 200);
  const terms = (await call('GET', '/api/words')).body.map((w) => w.term);
  for (const t of ['growth', 'nervous', 'personal']) assert.ok(terms.includes(t), `${t} is saved`);
  assert.equal(terms.filter((t) => t === 'system').length, 1, '«system» was already there: not duplicated');
  assert.ok(!terms.includes('nervous system') && !terms.includes('personal growth'), 'the phrases are gone');
});
