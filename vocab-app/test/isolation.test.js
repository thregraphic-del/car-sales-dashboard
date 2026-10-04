// Several accounts on one site: every learner sees only their own data, and
// another learner's ids behave exactly like ids that do not exist.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-iso-');
process.env.NETLIFY = 'true';
delete process.env.SESSION_SECRET;
delete process.env.REGISTRATION;
delete process.env.REGISTRATION_CODE;
delete process.env.OPENROUTER_API_KEY;
process.env.SETUP_CODE = 'iso-setup-code';

let app;
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(app.base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* csv */
    }
    return { status: res.status, body: json, text };
  };
}
const A = client();
const B = client();
const TRANSCRIPT = '0:01 Honestly I was reluctant to quit, but I finally figured it out.\n0:09 We take so much for granted every single day.';

before(async () => {
  app = await startApp({ seed: false });
});
after(async () => {
  await app?.close();
  db.cleanup();
  for (const k of ['NETLIFY', 'SETUP_CODE']) delete process.env[k];
});

let a = {};
test('accounts: first is admin (setup code), the next registers as a normal user', async () => {
  assert.equal((await A('POST', '/api/auth/register', { username: 'sara', password: 'a-long-password-1' })).status, 401, 'first account needs the setup code');
  const ra = await A('POST', '/api/auth/register', { username: 'sara', password: 'a-long-password-1', code: 'iso-setup-code' });
  assert.equal(ra.status, 200);
  assert.equal(ra.body.user.role, 'admin');
  const dup = await B('POST', '/api/auth/register', { username: 'SARA', password: 'a-long-password-2' });
  assert.equal(dup.status, 409, 'usernames are unique regardless of case');
  const rb = await B('POST', '/api/auth/register', { username: 'noura', password: 'a-long-password-2', name: 'Noura' });
  assert.equal(rb.status, 200);
  assert.equal(rb.body.user.role, 'user');
  assert.notEqual(rb.body.user.id, ra.body.user.id);
  assert.equal((await B('GET', '/api/config')).body.user.name, 'Noura');
  for (const t of ['password_hash', 'scrypt$']) assert.ok(!JSON.stringify(rb.body).includes(t));
});

test('learner A builds up data', async () => {
  assert.equal((await A('POST', '/api/data/demo')).status, 200);
  const src = await A('POST', '/api/sources/youtube', { url: 'https://youtu.be/AAAAAAAAAAA', transcript: TRANSCRIPT });
  assert.equal(src.status, 200);
  a.source = src.body.source_id;
  const view = (await A('GET', `/api/sources/${a.source}`)).body;
  a.line = view.lines[0].id;
  a.item = view.items[0];
  a.words = (await A('GET', '/api/words')).body;
  a.uv = a.words[0].uv_id;
  a.group = (await A('GET', '/api/groups')).body[0].id;
  a.backup = (await A('POST', '/api/data/backups')).body.id;
  await A('PATCH', `/api/words/${a.uv}`, { user_arabic: 'معنى خاص بسارة', example: 'Sara private example sentence here.' });
  assert.ok(a.words.length > 30);
});

test("learner B sees none of A's data", async () => {
  assert.deepEqual((await B('GET', '/api/words')).body, []);
  assert.deepEqual((await B('GET', '/api/sources')).body, []);
  assert.deepEqual((await B('GET', '/api/groups')).body, []);
  const sum = (await B('GET', '/api/data/summary')).body;
  assert.ok(Object.values(sum.counts).every((n) => n === 0), JSON.stringify(sum.counts));
  assert.equal(sum.backups.length, 0);
  const snap = (await B('GET', '/api/data/backup')).body;
  assert.equal(snap.tables.user_vocabulary.length, 0);
  assert.equal(snap.tables.users.length, 1);
  const today = (await B('GET', '/api/today')).body;
  assert.equal(today.plan.total, 0);
  assert.equal(today.stats.total, 0);
  const csv = (await B('GET', '/api/export?range=all')).text;
  assert.equal(csv.replace(/^﻿/, '').trim().split(/\r?\n/).length, 1, 'only the header');
});

test("A's ids are 'not found' for B — reading, changing and deleting", async () => {
  const notFound = async (method, url, body) => {
    const r = await B(method, url, body);
    assert.equal(r.status, 404, `${method} ${url} → ${r.status} ${r.text}`);
  };
  await notFound('GET', `/api/sources/${a.source}`);
  await notFound('GET', `/api/sources/${a.source}/translation`);
  await notFound('POST', `/api/sources/${a.source}/translation`);
  await notFound('POST', `/api/sources/${a.source}/refine`);
  await notFound('DELETE', `/api/sources/${a.source}`);
  await notFound('GET', `/api/words/${a.uv}`);
  await notFound('PATCH', `/api/words/${a.uv}`, { user_arabic: 'x' });
  await notFound('PUT', `/api/words/${a.uv}/groups`, { group_ids: [] });
  await notFound('POST', '/api/review', { uv_id: a.uv, grade: 'good', source: 'flashcard' });
  await notFound('PATCH', `/api/groups/${a.group}`, { name: 'stolen' });
  await notFound('POST', `/api/groups/${a.group}/words`, { uv_ids: [a.uv] });
  await notFound('DELETE', `/api/groups/${a.group}/words`, { uv_ids: [a.uv] });
  await notFound('GET', `/api/data/backups/${a.backup}`);
  assert.equal((await B('POST', '/api/words/delete', { uv_ids: [a.uv] })).body.deleted, 0);
  await B('DELETE', `/api/words/${a.uv}`);
  await B('DELETE', `/api/groups/${a.group}`);
  assert.deepEqual((await B('GET', `/api/practice?ids=${a.uv}`)).body.words, []);
  assert.deepEqual((await B('GET', `/api/words?ids=${a.uv}`)).body, []);
  // Nothing of A's changed.
  const w = (await A('GET', `/api/words/${a.uv}`)).body;
  assert.equal(w.user_arabic, 'معنى خاص بسارة');
  assert.equal((await A('GET', '/api/groups')).body.length, 3);
  assert.equal((await A('GET', `/api/sources/${a.source}`)).status, 200);
});

test("B cannot borrow A's transcript lines or contexts", async () => {
  const look = (await B('GET', `/api/lookup?line_id=${a.line}&word=reluctant`)).body;
  assert.equal(look.found, true, 'the shared dictionary still explains the word');
  assert.equal(look.context_sentence, null, "A's sentence is not revealed");
  assert.equal(look.occurrence_id, null);
  const saved = await B('POST', '/api/words', { vocabulary_id: a.item.vocabulary_id, occurrence_id: a.item.occurrence_id });
  assert.equal(saved.status, 200);
  const mine = (await B('GET', `/api/words/${saved.body.uv_id}`)).body;
  assert.equal(mine.source, null, "A's video is not attached to B's word");
  assert.equal(mine.context_sentence, null);
  assert.ok(mine.contexts.every((c) => c.source_id !== a.source));
  assert.ok(!mine.examples.some((e) => /Sara private/.test(e.sentence)), "A's own examples stay private");
  assert.notEqual(mine.user_arabic, 'معنى خاص بسارة');
});

test('the same video can be added by both learners, as separate copies', async () => {
  const b = await B('POST', '/api/sources/youtube', { url: 'https://youtu.be/AAAAAAAAAAA', transcript: TRANSCRIPT });
  assert.equal(b.status, 200);
  assert.notEqual(b.body.source_id, a.source);
  assert.equal(b.body.cached, false);
  await B('DELETE', `/api/sources/${b.body.source_id}`);
  assert.equal((await A('GET', `/api/sources/${a.source}`)).status, 200, "deleting B's copy keeps A's");
});

test("B importing a backup only replaces B's data", async () => {
  const before = (await A('GET', '/api/data/summary')).body.counts;
  assert.equal((await B('POST', '/api/data/import/begin', { confirm: 'REPLACE' })).status, 200);
  assert.equal((await B('POST', '/api/data/import/rows', { table: 'word_groups', rows: [{ id: a.group, name: 'Mine' }] })).status, 200);
  await B('POST', '/api/data/import/finish');
  assert.deepEqual((await A('GET', '/api/data/summary')).body.counts, before);
  assert.deepEqual((await B('GET', '/api/groups')).body.map((g) => g.name), ['Mine']);
  assert.equal((await A('GET', '/api/groups')).body.length, 3);
});

test('logout ends the session; signing in again restores the same account', async () => {
  await B('POST', '/api/auth/logout');
  assert.equal((await B('GET', '/api/words')).status, 401);
  assert.equal((await B('POST', '/api/auth/login', { username: 'Noura', password: 'a-long-password-2' })).status, 200, 'username is case-insensitive');
  assert.deepEqual((await B('GET', '/api/groups')).body.map((g) => g.name), ['Mine']);
});
