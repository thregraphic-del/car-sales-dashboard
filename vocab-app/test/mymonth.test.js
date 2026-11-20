// The owner's month report: clips added, minutes, AI calls and cost — read from what is already stored.
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

test('counts this month: a pasted text is counted, numbers are plain numbers', async () => {
  await call('POST', '/api/sources/text', { text: 'The sun rose over the quiet hills. Birds began to sing in the trees.', title: 'Morning' });
  const r = await call('GET', '/api/ai/my-month');
  assert.equal(r.status, 200);
  assert.equal(r.body.admin, true);
  assert.equal(r.body.texts, 1);
  assert.equal(r.body.videos, 0);
  for (const k of ['calls', 'cost', 'minutes', 'transcripts', 'active_days']) assert.equal(typeof r.body[k], 'number');
  assert.ok(r.body.days_in_month >= 28);
});
