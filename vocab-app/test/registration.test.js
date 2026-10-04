// REGISTRATION_CODE: after the first account, new learners need the invite code.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-reg-');
process.env.NETLIFY = 'true';
delete process.env.SESSION_SECRET;
delete process.env.SETUP_CODE; // no setup code: the first visitor creates the admin account
process.env.REGISTRATION_CODE = 'family-2026';

let app;
const post = async (url, body) => {
  const res = await fetch(app.base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
before(async () => {
  app = await startApp({ seed: false });
});
after(async () => {
  await app?.close();
  db.cleanup();
  for (const k of ['NETLIFY', 'REGISTRATION_CODE']) delete process.env[k];
});

test('invite code required after the first account', async () => {
  const s0 = (await (await fetch(`${app.base}/api/auth/status`)).json());
  assert.equal(s0.setup_available, true);
  assert.equal(s0.setup_code_required, false);
  assert.equal((await post('/api/auth/register', { username: 'admin1', password: 'a-long-password' })).body.user.role, 'admin');
  const s1 = (await (await fetch(`${app.base}/api/auth/status`)).json());
  assert.equal(s1.registration, 'code');
  assert.equal(s1.registration_code_required, true);
  assert.equal((await post('/api/auth/register', { username: 'guest', password: 'a-long-password' })).status, 401);
  assert.equal((await post('/api/auth/register', { username: 'guest', password: 'a-long-password', code: 'nope' })).status, 401);
  const ok = await post('/api/auth/register', { username: 'guest', password: 'a-long-password', code: 'family-2026' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'user');
  assert.equal((await post('/api/auth/register', { username: 'x', password: 'a-long-password', code: 'family-2026' })).status, 400, 'username too short');
  assert.equal((await post('/api/auth/register', { username: 'guest2', password: 'short', code: 'family-2026' })).status, 400, 'password too short');
});
