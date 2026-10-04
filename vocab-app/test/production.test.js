// Production behaviour: accounts (first = administrator), security checks,
// backup and the import of a local database (replace after an automatic backup).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-prod-');
process.env.NETLIFY = 'true'; // production mode
delete process.env.SESSION_SECRET; // production generates its own signing key
process.env.SETUP_CODE = 'test-setup-code';
process.env.OPENROUTER_API_KEY = 'sk-or-secret-test-value';

let app;
let cookie = '';
const call = async (method, url, body, extra = {}) => {
  const res = await fetch(app.base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, body: json, text, set };
};

before(async () => {
  app = await startApp({ seed: false });
});
after(async () => {
  await app?.close();
  db.cleanup();
  for (const k of ['NETLIFY', 'SESSION_SECRET', 'SETUP_CODE', 'OPENROUTER_API_KEY']) delete process.env[k];
});

test('everything except login is closed before the owner signs in', async () => {
  assert.equal((await call('GET', '/api/today')).status, 401);
  assert.equal((await call('GET', '/api/words')).status, 401);
  const s = (await call('GET', '/api/auth/status')).body;
  assert.equal(s.required, true);
  assert.equal(s.owner_exists, false);
});

test('the first account needs the setup code and becomes the administrator', async () => {
  const bad = await call('POST', '/api/auth/setup', { setup_code: 'wrong', username: 'owner', password: 'a-long-password' });
  assert.equal(bad.status, 401);
  const weak = await call('POST', '/api/auth/setup', { setup_code: 'test-setup-code', username: 'owner', password: 'short' });
  assert.equal(weak.status, 400);
  const ok = await call('POST', '/api/auth/setup', { setup_code: 'test-setup-code', username: 'owner', password: 'a-long-password' });
  assert.equal(ok.status, 200);
  assert.match(ok.set, /HttpOnly/);
  assert.match(ok.set, /Secure/);
  assert.match(ok.set, /SameSite=Lax/);
  assert.equal(ok.body.user.role, 'admin');
  assert.equal((await call('GET', '/api/today')).status, 200);
  const s = (await call('GET', '/api/auth/status')).body;
  assert.equal(s.owner_exists, true);
  assert.equal(s.registration, 'open');
});

test('login / logout / wrong password', async () => {
  await call('POST', '/api/auth/logout');
  assert.equal(cookie, '');
  assert.equal((await call('GET', '/api/words')).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { username: 'owner', password: 'nope-nope-nope' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { username: 'owner', password: 'a-long-password' })).status, 200);
  assert.equal((await call('GET', '/api/words')).status, 200);
  const forged = await fetch(`${app.base}/api/words`, { headers: { Cookie: 'lt_session=eyJ1aWQiOjF9.forged' } });
  assert.equal(forged.status, 401);
});

test('secrets never reach the browser; dev-only endpoints are off', async () => {
  const cfg = await call('GET', '/api/config');
  assert.equal(cfg.status, 200);
  for (const secret of ['sk-or-secret-test-value', 'test-session-secret', 'test-setup-code', 'password_hash', 'scrypt$']) {
    assert.ok(!cfg.text.includes(secret), `config leaks ${secret}`);
  }
  assert.ok(!(await call('GET', '/api/version')).text.includes('/home'), 'no server paths');
  assert.equal((await call('POST', '/api/data/reset-demo')).status, 404);
  const cross = await call('POST', '/api/groups', { name: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(cross.status, 403, 'cross-site writes are rejected');
  const bad = await call('GET', '/api/words/abc');
  assert.equal(bad.status, 400);
  assert.ok(!/at .*\.js/.test(bad.text));
});

test('demo data only into an empty account', async () => {
  const d = await call('POST', '/api/data/demo');
  assert.equal(d.status, 200);
  assert.ok(d.body.saved > 30);
  assert.equal((await call('POST', '/api/data/demo')).status, 409);
});

test('backup → import (replace) restores exactly the same data, with a server backup first', async () => {
  const snap = (await call('GET', '/api/data/backup')).body;
  assert.equal(snap.format, 'lexitube-backup');
  const before = (await call('GET', '/api/data/summary')).body.counts;
  assert.ok(before.user_vocabulary > 30 && before.review_logs > 50);
  const wordsBefore = (await call('GET', '/api/words')).body;

  assert.equal((await call('POST', '/api/data/import/begin', {})).status, 400, 'needs explicit confirmation');
  const begin = (await call('POST', '/api/data/import/begin', { confirm: 'REPLACE', profile: { name: 'Sara', daily_goal: 12 } })).body;
  assert.ok(begin.backup_id);
  assert.equal(begin.previous.user_vocabulary, before.user_vocabulary);
  for (const [table, rows] of Object.entries(snap.tables)) {
    if (table === 'users') continue;
    for (let i = 0; i < rows.length; i += 500) {
      const r = await call('POST', '/api/data/import/rows', { table, rows: rows.slice(i, i + 500) });
      assert.equal(r.status, 200, `${table}: ${r.text}`);
    }
  }
  const fin = (await call('POST', '/api/data/import/finish')).body;
  assert.deepEqual(fin.counts, before, 'every row is back');
  // Ids are re-assigned (other learners share the database); content is identical.
  const groupNames = async () => new Map((await call('GET', '/api/groups')).body.map((g) => [g.id, g.name]));
  const namesBefore = new Map(snap.tables.word_groups.map((g) => [g.id, g.name]));
  const namesAfter = await groupNames();
  const shape = (ws, names) => ws.map((w) => [w.term, w.mastery, w.review_count, w.context_sentence, w.source?.title || null, w.group_ids.map((g) => names.get(g)).sort()])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const wordsAfter = (await call('GET', '/api/words')).body;
  assert.deepEqual(shape(wordsAfter, namesAfter), shape(wordsBefore, namesBefore));
  assert.equal((await call('GET', '/api/config')).body.user.name, 'Sara');
  // Sending existing groups again adds nothing (names are unique per learner).
  const again = await call('POST', '/api/data/import/rows', { table: 'word_groups', rows: snap.tables.word_groups });
  assert.equal(again.body.inserted, 0);
  const g = await call('POST', '/api/groups', { name: 'After import' });
  assert.equal(g.status, 200);
  const list = (await call('GET', '/api/data/summary')).body.backups;
  assert.ok(list.some((b) => b.reason === 'before-import'));
  const stored = await call('GET', `/api/data/backups/${begin.backup_id}`);
  assert.equal(JSON.parse(stored.text).tables.user_vocabulary.length, before.user_vocabulary);
});

test('the owner can change the password; old sessions stop working', async () => {
  const old = cookie;
  const r = await call('POST', '/api/auth/password', { current: 'a-long-password', password: 'a-new-long-password' });
  assert.equal(r.status, 200);
  const stale = await fetch(`${app.base}/api/words`, { headers: { Cookie: old } });
  assert.equal(stale.status, 401);
  assert.equal((await call('GET', '/api/words')).status, 200);
});
