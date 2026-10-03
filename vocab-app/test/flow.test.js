// End-to-end API tests on a fresh temporary database (offline mode, no AI key).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase();
delete process.env.OPENROUTER_API_KEY;
delete process.env.SESSION_SECRET;

let app;
let base;
const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* csv */
  }
  return { status: res.status, body: json, text, headers: res.headers };
};
const words = async (q = '') => (await call('GET', `/api/words${q}`)).body;

before(async () => {
  app = await startApp();
  ({ base } = app);
});
after(async () => {
  await app?.close();
  db.cleanup();
});

const TRANSCRIPT = [
  '0:10 Honestly I was reluctant to quit, but I finally figured it out.',
  '0:21 We take so much for granted, and we procrastinate on what matters.',
  '0:33 In the long run, being consistent beats being perfect.',
  '0:45 Scientists carry out research on sustainable cities, whereas politicians rarely look into it.',
].join('\n');

test('demo data: sources keep full transcripts, groups and learning history exist', async () => {
  const sources = (await call('GET', '/api/sources')).body;
  assert.equal(sources.length, 3);
  for (const s of sources) assert.ok(s.line_count > s.item_count, 'transcript has more lines than suggested words');
  const ws = await words();
  assert.ok(ws.length >= 40 && ws.length <= 60);
  assert.ok(ws.some((w) => w.status === 'mastered') && ws.some((w) => w.difficult) && ws.some((w) => w.due));
  assert.equal((await call('GET', '/api/groups')).body.length, 3);
});

test('invalid links get a clear, human message', async () => {
  const r = await call('POST', '/api/sources/youtube', { url: 'https://example.com' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /يوتيوب/);
});

let sourceId;
test('YouTube transcript: preserved exactly, timestamps from the transcript, analysis saves nothing by itself', async () => {
  const before = (await words()).length;
  const a = await call('POST', '/api/sources/youtube', { url: 'https://youtu.be/AAAAAAAAAAA', transcript: TRANSCRIPT });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  sourceId = a.body.source_id;
  const v = (await call('GET', `/api/sources/${sourceId}`)).body;
  assert.deepEqual(v.lines.map((l) => l.start_seconds), [10, 21, 33, 45]);
  assert.equal(v.lines[1].text, 'We take so much for granted, and we procrastinate on what matters.');
  assert.deepEqual(v.lines.slice(0, 3).map((l) => l.duration), [11, 12, 12], 'subtitle durations come from the next line');
  const granted = v.items.find((i) => i.term === 'take something for granted');
  assert.equal(granted.timestamp_seconds, 21);
  const mark = v.marks.find((m) => m.vocabulary_id === granted.vocabulary_id);
  assert.equal(v.lines.find((l) => l.id === mark.line_id).text.slice(mark.start, mark.end), 'take so much for granted');
  assert.equal((await words()).length, before, 'nothing is saved automatically');
  // Re-opening the same link uses the stored analysis.
  const again = await call('POST', '/api/sources/youtube', { url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' });
  assert.equal(again.body.cached, true);
});

test('click lookup: known word in context, basic word, grammar word', async () => {
  const v = (await call('GET', `/api/sources/${sourceId}`)).body;
  const line = v.lines[3];
  const r = (await call('GET', `/api/lookup?line_id=${line.id}&word=sustainable`)).body;
  assert.equal(r.found, true);
  assert.equal(r.term, 'sustainable');
  assert.equal(r.context_sentence, line.text);
  assert.equal(r.timestamp_seconds, 45);
  const basic = (await call('GET', `/api/lookup?line_id=${line.id}&word=cities`)).body;
  assert.equal(basic.found, false);
  assert.equal(basic.tier, 'basic');
  const fn = (await call('GET', `/api/lookup?line_id=${line.id}&word=whereas`)).body;
  assert.ok(fn.found || fn.tier === 'function');
});

test('saving is explicit, idempotent and keeps the source context', async () => {
  const v = (await call('GET', `/api/sources/${sourceId}`)).body;
  const item = v.items.find((i) => !i.user_state);
  const s1 = (await call('POST', '/api/words', { vocabulary_id: item.vocabulary_id, occurrence_id: item.occurrence_id })).body;
  assert.equal(s1.already, false);
  const s2 = (await call('POST', '/api/words', { vocabulary_id: item.vocabulary_id, occurrence_id: item.occurrence_id })).body;
  assert.equal(s2.already, true);
  assert.equal(s2.uv_id, s1.uv_id);
  const w = (await call('GET', `/api/words/${s1.uv_id}`)).body;
  assert.equal(w.source.youtube_id, 'AAAAAAAAAAA');
  assert.equal(w.context_sentence, v.lines.find((l) => l.id === item.line_id).text);
});

test('a saved word seen in a new source gains a second context (no duplicate word)', async () => {
  const before = (await words()).filter((w) => w.term === 'reluctant');
  assert.equal(before.length, 1);
  const w = (await call('GET', `/api/words/${before[0].uv_id}`)).body;
  assert.ok(w.contexts.length >= 2, 'demo context + the new video');
  assert.ok(w.contexts.some((c) => c.source_id === sourceId));
});

test('import: duplicates detected, new example added once, global meaning untouched', async () => {
  const vocabBefore = (await words()).length;
  const text = 'Reluctant = متردد جدا\nThe manager was reluctant to approve the budget.\nfigure out\nreports\nsustainable — مستدام';
  const p = (await call('POST', '/api/import/preview', { text })).body;
  const rel = p.items.find((i) => i.term === 'reluctant');
  assert.equal(rel.status, 'saved');
  assert.ok(rel.new_info.includes('example'));
  assert.ok(rel.new_info.includes('meaning'));
  const fig = p.items.find((i) => i.input === 'figure out');
  assert.equal(fig.term, 'figure something out', 'recognised as the existing phrase');
  assert.equal(fig.status, 'saved');
  assert.equal(p.items.find((i) => i.input === 'reports').term, 'report', 'plural → singular');

  const save = (await call('POST', '/api/import/save', { items: p.items })).body.results;
  assert.equal(save.find((r) => r.term === 'reluctant').result, 'updated');
  assert.equal(save.find((r) => r.term === 'figure something out').result, 'unchanged');
  const again = (await call('POST', '/api/import/save', { items: p.items })).body.results;
  assert.ok(again.every((r) => r.result === 'unchanged'), 'saving the same input twice changes nothing');

  const all = await words();
  assert.equal(all.filter((w) => w.term === 'reluctant').length, 1);
  assert.equal(all.length, vocabBefore + 2, 'only "report" and "sustainable" are new');
  const rel2 = all.find((w) => w.term === 'reluctant');
  assert.equal(rel2.arabic_general, 'متردد / غير راغب', 'global meaning not overwritten');
  assert.equal(rel2.user_arabic, 'متردد جدا', "learner's own meaning kept separately");
  assert.equal(rel2.examples.filter((e) => /approve the budget/.test(e.sentence)).length, 1);
});

test('import of free text becomes a readable source', async () => {
  const p = (await call('POST', '/api/import/preview', { text: 'I need to improve the accuracy of this report because the current data is not reliable and we take too much for granted.' })).body;
  assert.equal(p.items.length, 0);
  assert.ok(p.source?.id);
  const v = (await call('GET', `/api/sources/${p.source.id}`)).body;
  assert.equal(v.source.kind, 'text');
  assert.ok(v.items.some((i) => i.term === 'take something for granted'));
  const tr = (await call('GET', `/api/sources/${p.source.id}/translation`)).body;
  assert.equal(tr.status, 'unavailable', 'no AI → honest status instead of fake translation');
});

test('groups: learner-named, case-insensitive, one word in many groups, one vocabulary row', async () => {
  const g1 = (await call('POST', '/api/groups', { name: 'Finance' })).body;
  const g2 = (await call('POST', '/api/groups', { name: 'Data Analysis' })).body;
  const dup = (await call('POST', '/api/groups', { name: 'finance' })).body;
  assert.equal(dup.id, g1.id);
  assert.equal(dup.existed, true);
  const w = (await words()).find((x) => x.term === 'sustainable');
  await call('PUT', `/api/words/${w.uv_id}/groups`, { group_ids: [g1.id, g2.id] });
  const after = (await words()).filter((x) => x.term === 'sustainable');
  assert.equal(after.length, 1);
  assert.deepEqual(after[0].group_ids.sort(), [g1.id, g2.id].sort());
  assert.equal((await words(`?group_id=${g2.id}`)).length, 1);
  const r = await call('PATCH', `/api/groups/${g2.id}`, { name: 'FINANCE' });
  assert.equal(r.status, 409);
  await call('DELETE', `/api/groups/${g1.id}`);
  assert.equal((await words()).filter((x) => x.term === 'sustainable').length, 1, 'deleting a group keeps the words');
});

test('bulk: move selected words between groups, then delete them', async () => {
  const groups = (await call('GET', '/api/groups')).body;
  const work = groups.find((g) => g.name === 'Work');
  const uni = groups.find((g) => g.name === 'University');
  const inWork = (await words(`?group_id=${work.id}`)).slice(0, 2).map((w) => w.uv_id);
  // move = add to target + remove from current
  await call('POST', `/api/groups/${uni.id}/words`, { uv_ids: inWork });
  await call('DELETE', `/api/groups/${work.id}/words`, { uv_ids: inWork });
  const now = await words();
  for (const id of inWork) {
    const w = now.find((x) => x.uv_id === id);
    assert.ok(w.group_ids.includes(uni.id) && !w.group_ids.includes(work.id));
  }
  const before = now.length;
  const del = (await call('POST', '/api/words/delete', { uv_ids: inWork })).body;
  assert.equal(del.deleted, 2);
  assert.equal((await words()).length, before - 2);
});

test('mistakes become a learning signal: missed words replay first and lead smart practice', async () => {
  const pool = (await words()).filter((w) => !w.difficult).slice(0, 3);
  for (const w of pool) await call('POST', '/api/review', { uv_id: w.uv_id, grade: 'hard', source: 'quiz' });
  const replay = (await call('GET', `/api/practice?ids=${pool.map((w) => w.uv_id).join(',')}`)).body;
  const ids = replay.words.map((w) => w.uv_id);
  assert.deepEqual(new Set(ids.slice(0, 3)), new Set(pool.map((w) => w.uv_id)), 'exactly the missed words first');
  assert.ok(replay.words.slice(3).every((w) => w.support), 'extra words are marked as support');
  const smart = (await call('GET', '/api/practice?focus=smart&size=10')).body.words.map((w) => w.uv_id);
  for (const w of pool) assert.ok(smart.slice(0, 5).includes(w.uv_id), 'recent mistakes lead smart practice');
  const stats = (await call('GET', '/api/stats')).body;
  assert.ok(stats.attention.length > 0);
});

test('export: CSV with useful columns and working filters', async () => {
  const all = await call('GET', '/api/export?range=all');
  assert.match(all.headers.get('content-type'), /text\/csv/);
  const lines = all.text.replace(/^﻿/, '').trim().split(/\r?\n/);
  assert.equal(lines[0], 'Word,Arabic,CEFR Level,Part of Speech,Simple English,Example,Example Arabic,Group,Topic,Source,Saved Date,Mastery,Correct,Wrong,Difficult');
  assert.equal(lines.length - 1, (await words()).length);
  const groups = (await call('GET', '/api/groups')).body;
  const work = groups.find((g) => g.name === 'Work');
  const g = await call('GET', `/api/export?group_id=${work.id}&format=json`);
  assert.equal(g.body.count, work.count);
  assert.ok(g.body.words.every((w) => w.Group.includes('Work')));
  const hard = await call('GET', '/api/export?difficult=1&format=json');
  assert.ok(hard.body.words.every((w) => w.Difficult === 'yes'));
  const b1 = await call('GET', '/api/export?level=B1&format=json');
  assert.ok(b1.body.words.length > 0 && b1.body.words.every((w) => w['CEFR Level'] === 'B1'));
  const week = await call('GET', '/api/export?range=week&format=json');
  assert.ok(week.body.count < lines.length - 1, 'recent range excludes older words');
});

test('errors never expose stack traces', async () => {
  const r = await call('GET', '/api/words/999999');
  assert.equal(r.status, 404);
  assert.ok(!/at .*\.js/.test(r.text));
  const bad = await call('POST', '/api/import/preview', { text: '   ' });
  assert.equal(bad.status, 400);
});

test("today's plan is stable and mixes buckets", async () => {
  const p1 = (await call('GET', '/api/today')).body.plan;
  const p2 = (await call('GET', '/api/today')).body.plan;
  assert.deepEqual(p1.items.map((i) => i.uv_id), p2.items.map((i) => i.uv_id));
  assert.equal(p1.total, 10);
  assert.ok(p1.counts.difficult > 0 && p1.counts.review > 0);
});
