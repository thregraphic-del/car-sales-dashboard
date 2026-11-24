// ✏️ Changing the username; «انضم لفريقنا» is automatic for a signed-in account and refused for guests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-username-');
process.env.NETLIFY = 'true';
delete process.env.SESSION_SECRET;
delete process.env.SETUP_CODE;
delete process.env.REGISTRATION_CODE;
delete process.env.REGISTRATION;

let app;
const call = async (method, url, body, cookie) => {
  const res = await fetch(app.base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie');
  return { status: res.status, body: await res.json().catch(() => null), cookie: set ? set.split(';')[0] : null };
};
before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); delete process.env.NETLIFY; });

test('username can be changed (unique, valid) and the user can sign in with it', async () => {
  const a = await call('POST', '/api/auth/register', { username: 'owner1', password: 'a-long-password' });
  const b = await call('POST', '/api/auth/register', { username: 'sara', password: 'a-long-password' });
  assert.equal((await call('POST', '/api/auth/username', { username: 'x' }, b.cookie)).status, 400);
  assert.equal((await call('POST', '/api/auth/username', { username: 'Owner1' }, b.cookie)).status, 409);
  assert.equal((await call('POST', '/api/auth/username', { username: 'sara' })).status, 401);
  const r = await call('POST', '/api/auth/username', { username: 'sara_new' }, b.cookie);
  assert.equal(r.status, 200);
  assert.equal(r.body.username, 'sara_new');
  assert.equal((await call('POST', '/api/auth/login', { username: 'sara_new', password: 'a-long-password' })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { username: 'sara', password: 'a-long-password' })).status, 401);
  assert.ok(a.cookie);
});

test('joining the team needs no form: automatic from the account; guests are refused', async () => {
  const g = await call('POST', '/api/auth/guest');
  assert.equal((await call('POST', '/api/team/join', {}, g.cookie)).status, 403);
  const l = await call('POST', '/api/auth/login', { username: 'sara_new', password: 'a-long-password' });
  const j = await call('POST', '/api/team/join', {}, l.cookie);
  assert.equal(j.status, 200);
  assert.ok(j.body.member.code);
});
