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

test('cost per clip: each AI step is kept with its clip, and work done before the clip had an id is attached to it', async () => {
  const { run, get } = await import('../server/db/index.js');
  const made = await call('POST', '/api/sources/text', { text: 'A short text for the cost screen. It has two sentences.', title: 'Cost clip' });
  const id = made.body.source_id;
  const u = (await get('SELECT user_id FROM sources WHERE id = ?', id)).user_id;
  const day = new Date().toISOString().slice(0, 10);
  await run("INSERT INTO ai_cost_items (user_id, source_id, req_id, task, day, prompt_tokens, completion_tokens, cost) VALUES (?, ?, NULL, 'translate_lines_v3', ?, 1000, 500, 0.02)", u, id, day);
  await run("INSERT INTO ai_cost_items (user_id, source_id, req_id, task, day, prompt_tokens, completion_tokens, cost) VALUES (?, ?, NULL, 'video_summary_v2', ?, 800, 300, 0.01)", u, id, day);
  await run("INSERT INTO ai_cost_items (user_id, source_id, req_id, task, day, cost) VALUES (?, NULL, 'r1', 'suggest_words', ?, 0.005)", u, day);
  const r = await call('GET', '/api/ai/clip-costs');
  assert.equal(r.status, 200);
  const clip = r.body.clips.find((c) => c.source_id === id);
  assert.equal(clip.title, 'Cost clip');
  assert.equal(Math.round(clip.cost * 1000), 30);
  assert.deepEqual(clip.steps.map((s) => s.task), ['translate_lines_v3', 'video_summary_v2']);
  assert.ok(r.body.clips.some((c) => c.source_id === 0)); // the one not tied to any clip
});

test('attachUsage: rows written before the clip existed get the clip id (same request only)', async () => {
  const { run, get } = await import('../server/db/index.js');
  const { aiContext, attachUsage } = await import('../server/services/ai.js');
  const made = await call('POST', '/api/sources/text', { text: 'Another little text for attaching costs. Nothing else here.', title: 'Attach me' });
  const id = made.body.source_id;
  const u = (await get('SELECT user_id FROM sources WHERE id = ?', id)).user_id;
  const day = new Date().toISOString().slice(0, 10);
  await run("INSERT INTO ai_cost_items (user_id, source_id, req_id, task, day, cost) VALUES (?, NULL, 'same', 'extract_chunk_v3', ?, 0.01)", u, day);
  await run("INSERT INTO ai_cost_items (user_id, source_id, req_id, task, day, cost) VALUES (?, NULL, 'other', 'extract_chunk_v3', ?, 0.01)", u, day);
  await aiContext.run({ userId: u, reqId: 'same', sourceId: null }, () => attachUsage(id));
  assert.equal((await get("SELECT source_id FROM ai_cost_items WHERE req_id = 'same'")).source_id, id);
  assert.equal((await get("SELECT source_id FROM ai_cost_items WHERE req_id = 'other'")).source_id, null);
});
