// The summary and the recaps are off by default and refused by the server until the owner switches them on.
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

test('off by default: config says so and the server refuses both', async () => {
  const cfg = (await call('GET', '/api/config')).body;
  assert.deepEqual(cfg.paid, { summary: false, recap: false });
  assert.equal(cfg.can_set_paid, true); // the single local learner is the owner
  const made = await call('POST', '/api/sources/text', { text: 'One short text for the switch test. It has two sentences in it.', title: 'Switch' });
  const id = made.body.source_id;
  assert.equal((await call('POST', `/api/sources/${id}/summary`, {})).status, 403);
  assert.equal((await call('POST', `/api/sources/${id}/recap`, { from: 0, to: 300 })).status, 403);
});

test('the owner switches each one separately', async () => {
  const id = (await call('GET', '/api/sources')).body[0].id;
  const r = await call('POST', '/api/paid', { summary: true });
  assert.deepEqual(r.body.paid, { summary: true, recap: false });
  assert.notEqual((await call('POST', `/api/sources/${id}/summary`, {})).status, 403);
  assert.equal((await call('POST', `/api/sources/${id}/recap`, { from: 0, to: 300 })).status, 403);
  assert.deepEqual((await call('GET', '/api/config')).body.paid, { summary: true, recap: false });
  await call('POST', '/api/paid', { summary: false });
  assert.equal((await call('POST', `/api/sources/${id}/summary`, {})).status, 403);
});
