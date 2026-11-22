// A friend can be added by username, email or phone number (the same ways an account can sign in).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-frl-');
process.env.NETLIFY = 'true';
delete process.env.SESSION_SECRET;
delete process.env.REGISTRATION;
delete process.env.REGISTRATION_CODE;
delete process.env.OPENROUTER_API_KEY;
process.env.SETUP_CODE = 'frl-setup-code';

let app;
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(app.base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}
const A = client(); const B = client(); const C = client(); const D = client();

before(async () => { app = await startApp({ seed: false }); });
after(async () => { await app?.close(); db.cleanup(); for (const k of ['NETLIFY', 'SETUP_CODE']) delete process.env[k]; });

test('add a friend by username, email, or phone number', async () => {
  await A('POST', '/api/auth/register', { username: 'sara', password: 'a-long-password-1', code: 'frl-setup-code' });
  await B('POST', '/api/auth/register', { username: 'noura', password: 'a-long-password-2', email: 'Noura@Example.com', phone: '0551234567' });
  await C('POST', '/api/auth/register', { username: 'huda', password: 'a-long-password-3', email: 'huda@example.com' });
  await D('POST', '/api/auth/register', { username: 'reem', password: 'a-long-password-4', phone: '0561112233' });
  const byName = await A('POST', '/api/social/friends', { login: '@noura' });
  assert.equal(byName.status, 200);
  const byEmail = await A('POST', '/api/social/friends', { login: ' HUDA@example.com ' });
  assert.equal(byEmail.status, 200, 'email, any case');
  const byPhone = await A('POST', '/api/social/friends', { login: '+966 56 111 2233' });
  assert.equal(byPhone.status, 200, 'phone in another written form');
  const list = (await A('GET', '/api/social/friends')).body.friends.filter((f) => !f.me).map((f) => f.username).sort();
  assert.deepEqual(list, ['huda', 'noura', 'reem']);
  // the old field name still works, and unknown people get a clear message
  assert.equal((await B('POST', '/api/social/friends', { username: 'sara' })).status, 200);
  const none = await A('POST', '/api/social/friends', { login: 'nobody@example.com' });
  assert.equal(none.status, 404);
  assert.match(none.body.error, /الإيميل أو الجوال/);
  assert.equal((await A('POST', '/api/social/friends', { login: 'sara' })).status, 400, 'not yourself');
});
