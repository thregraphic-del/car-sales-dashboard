// 👤 Guests: try the site without an account, a small free trial, then sign up keeping everything.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-guest-');
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

test('guests: allowed only after the administrator exists; trial limits; sign-up keeps the data', async () => {
  assert.equal((await call('GET', '/api/auth/status')).body.guest_allowed, false, 'no guests before the first (admin) account');
  assert.equal((await call('POST', '/api/auth/guest')).status, 403);
  await call('POST', '/api/auth/register', { username: 'owner1', password: 'a-long-password' });
  assert.equal((await call('GET', '/api/auth/status')).body.guest_allowed, true);

  const g = await call('POST', '/api/auth/guest');
  assert.equal(g.status, 200);
  assert.equal(g.body.user.guest, true);
  const ck = g.cookie;
  assert.ok(ck);
  const st = (await call('GET', '/api/auth/status', null, ck)).body;
  assert.equal(st.logged_in, true);
  assert.equal(st.guest, true);

  // two texts are fine, the third asks to sign up (kindly, with a code the page understands)
  const text = 'Learning a new language takes patience and practice. Every day you remember a little more. Consistency matters more than talent.';
  assert.equal((await call('POST', '/api/sources/text', { text }, ck)).status, 200);
  const s2 = await call('POST', '/api/sources/text', { text: `${text} Second.` }, ck);
  assert.equal(s2.status, 200);
  const s3 = await call('POST', '/api/sources/text', { text: `${text} Third.` }, ck);
  assert.equal(s3.status, 403);
  assert.equal(s3.body.code, 'guest_limit');

  // words: up to 10, the 11th asks to sign up
  const terms = ['patience', 'practice', 'remember', 'consistency', 'talent', 'improve', 'habit', 'focus', 'effort', 'progress', 'achieve'];
  for (const [i, term] of terms.entries()) {
    const r = await call('POST', '/api/import/save', { items: [{ term, arabic: 'كلمة' }] }, ck);
    if (i < 10) assert.equal(r.status, 200, term);
    else { assert.equal(r.status, 403); assert.equal(r.body.code, 'guest_limit'); }
  }
  const before = (await call('GET', '/api/words', null, ck)).body.length;
  assert.equal(before, 10);

  // sign up as the guest: same learner, everything kept; the guest session is replaced
  const up = await call('POST', '/api/auth/register', { username: 'was_guest', password: 'another-long-pass' }, ck);
  assert.equal(up.status, 200);
  assert.equal(up.body.user.id, g.body.user.id);
  assert.equal(up.body.user.guest, false);
  const ck2 = up.cookie;
  assert.equal((await call('GET', '/api/words', null, ck2)).body.length, before);
  assert.equal((await call('GET', '/api/auth/status', null, ck)).body.logged_in, false, 'the old guest cookie no longer works');
  // no more trial limits
  assert.equal((await call('POST', '/api/sources/text', { text: `${text} Fourth.` }, ck2)).status, 200);
});
