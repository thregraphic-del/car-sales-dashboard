// «انضم لفريقنا»: join → code → someone signs up with it → credit → payout request → owner decision; and the owner's panel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase();
delete process.env.OPENROUTER_API_KEY;
delete process.env.SESSION_SECRET;

let app;
const call = async (method, url, body) => {
  const res = await fetch(app.base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

before(async () => { app = await startApp(); });
after(async () => { await app?.close(); db.cleanup(); });

test('not a member yet; the form is checked', async () => {
  assert.equal((await call('GET', '/api/team/me')).body.member, null);
  assert.equal((await call('POST', '/api/team/join', { name: 'ن', email: 'x', phone: '1' })).status, 400);
  assert.equal((await call('POST', '/api/team/join', { name: 'سارة', email: 'bad', phone: '0501234567' })).status, 400);
  assert.equal((await call('POST', '/api/team/join', { name: 'سارة', email: 'sara@example.com', phone: '12' })).status, 400);
});

test('joining gives a code; joining twice is refused', async () => {
  const r = await call('POST', '/api/team/join', { name: 'سارة أحمد', email: 'Sara@Example.com', phone: '٠٥٠١٢٣٤٥٦٧' });
  assert.equal(r.status, 200);
  assert.match(r.body.member.code, /^[A-Z2-9]{3}$/);
  assert.equal(r.body.member.email, 'sara@example.com');
  assert.equal(r.body.member.phone, '966501234567');
  assert.equal(r.body.member.referrals, 0);
  assert.equal((await call('POST', '/api/team/join', { name: 'سارة', email: 'sara@example.com', phone: '0501234567' })).status, 409);
});

test('contact details are public once the owner sets them', async () => {
  assert.deepEqual((await call('GET', '/api/config')).body.contact, { email: '', phone: '', whatsapp: '', instagram: '', tiktok: '' });
  const s = await call('PUT', '/api/admin/settings', { contact: { email: 'hi@3goal.test', whatsapp: '+966 50 000 0000', phone: '٠٥٠١٢٣', instagram: 'https://instagram.com/3goal_app/?hl=ar', tiktok: '@3goal.app' }, commission: { mode: 'fixed', value: 10 }, min_payout: 100 });
  assert.equal(s.status, 200);
  assert.deepEqual((await call('GET', '/api/config')).body.contact, { email: 'hi@3goal.test', phone: '050123', whatsapp: '966500000000', instagram: '3goal_app', tiktok: '3goal.app' });
});

test('credits and the payout request: only from the minimum, then the owner pays', async () => {
  const me = (await call('GET', '/api/team/me')).body.member;
  assert.equal((await call('POST', '/api/team/payout')).status, 400); // nothing earned yet
  const team = (await call('GET', '/api/admin/team')).body.members;
  const id = team[0].id;
  await call('POST', `/api/admin/team/${id}/credit`, { amount: 60, note: 'مشترك ١' });
  assert.equal((await call('POST', '/api/team/payout')).status, 400); // 60 < 100
  await call('POST', `/api/admin/team/${id}/credit`, { amount: 50, note: 'مشترك ٢' });
  const req = await call('POST', '/api/team/payout');
  assert.equal(req.status, 200);
  assert.equal(req.body.member.pending, 11000);
  assert.equal(req.body.member.available, 0);
  assert.equal(me.code, req.body.member.code);
  const list = (await call('GET', '/api/admin/payouts')).body.payouts;
  assert.equal(list[0].status, 'pending');
  const done = await call('POST', `/api/admin/payouts/${list[0].id}`, { action: 'paid', note: 'حوّلنا' });
  assert.equal(done.body.payouts[0].status, 'paid');
  assert.equal((await call('POST', `/api/admin/payouts/${list[0].id}`, { action: 'paid' })).status, 409); // only once
  const after = (await call('GET', '/api/team/me')).body.member;
  assert.equal(after.paid, 11000);
  assert.equal(after.available, 0);
  assert.equal(after.requests[0].seen, 0);
  await call('POST', '/api/team/ack');
  assert.equal((await call('GET', '/api/team/me')).body.member.requests[0].seen, 1);
});

test('the owner panel numbers', async () => {
  const o = (await call('GET', '/api/admin/overview')).body;
  assert.equal(o.team.members, 1);
  assert.equal(o.team.paid_cents, 11000);
  assert.ok(o.users.total >= 1);
  assert.ok(Array.isArray((await call('GET', '/api/admin/users')).body.users));
  assert.equal((await call('GET', '/api/admin/settings')).body.settings.commission.value, 10);
});

test('someone who signs up with the code is counted once, never for yourself', async () => {
  const { ensureUser } = await import('../server/data/users.js');
  const { noteReferral } = await import('../server/data/team.js');
  const code = (await call('GET', '/api/team/me')).body.member.code;
  assert.equal(await noteReferral(1, code), false); // the member herself
  await ensureUser(2);
  assert.equal(await noteReferral(2, code.toLowerCase()), true);
  assert.equal(await noteReferral(2, code), true); // asked again: still one row
  assert.equal(await noteReferral(2, 'NOPE'), false);
  const me = (await call('GET', '/api/team/me')).body.member;
  assert.equal(me.referrals, 1);
  assert.equal((await call('GET', '/api/admin/team')).body.members[0].referrals, 1);
});

test('every member gets a short code of their own', async () => {
  const { ensureUser } = await import('../server/data/users.js');
  const { join } = await import('../server/data/team.js');
  const codes = new Set([(await call('GET', '/api/team/me')).body.member.code]);
  for (let id = 10; id < 40; id += 1) {
    await ensureUser(id);
    const m = await join(id, { name: `عضو ${id}`, email: `m${id}@example.com`, phone: '0501234567' });
    assert.match(m.code, /^[A-Z2-9]{3,4}$/);
    codes.add(m.code);
  }
  assert.equal(codes.size, 31); // no two the same
});
