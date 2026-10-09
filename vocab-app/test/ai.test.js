// OpenRouter "explain this" with a mocked API: success, failures, limits, secrecy.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-ai-');
const KEY = 'sk-or-v1-test-key-never-shown-0000';
process.env.OPENROUTER_API_KEY = KEY;
process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
process.env.AI_DAILY_LIMIT_PER_USER = '12'; // shared by all tests below (one learner)
delete process.env.SESSION_SECRET;

const realFetch = globalThis.fetch;
let reply;
let calls = [];
const GOOD = { arabic: 'يكتشف الحل', explanation: 'تعني أن تفهم الشيء بعد تفكير.', simple_english: 'to understand', grammar_note: '', key_words: [{ term: 'figure something out', arabic: 'يفهم', level: 'B1', note: '' }] };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://openrouter.ai')) return realFetch(url, opts);
  calls.push({ u, auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null });
  if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-4o-mini' }] }), { status: 200 });
  return reply();
};
const ok = (content) => () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] }), { status: 200 });

let app;
let ai;
const post = async (text, extra = {}) => {
  const res = await realFetch(`${app.base}/api/ai/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ...extra }) });
  return { status: res.status, body: await res.json(), text: '' };
};
before(async () => {
  app = await startApp();
  ai = await import('../server/services/ai.js');
});
beforeEach(() => {
  calls = [];
  ai._resetAi();
});
after(async () => {
  globalThis.fetch = realFetch;
  await app?.close();
  db.cleanup();
  for (const k of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'AI_DAILY_LIMIT_PER_USER']) delete process.env[k];
});

test('explain: only the selection and its sentence are sent; result comes back; key stays server-side', async () => {
  reply = ok(GOOD);
  const v = await (await realFetch(`${app.base}/api/sources/1`)).json();
  const line = v.lines[3];
  const r = await post('figure it out', { line_id: line.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.arabic, 'يكتشف الحل');
  assert.equal(r.body.key_words[0].term, 'figure something out');
  const sent = calls.find((c) => c.u.endsWith('/chat/completions'));
  assert.equal(sent.auth, `Bearer ${KEY}`, 'key used server-side');
  assert.equal(sent.body.model, 'openai/gpt-4o-mini');
  const userMsg = sent.body.messages.at(-1).content;
  assert.match(userMsg, /Selected text: figure it out/);
  assert.ok(userMsg.includes(line.text) && userMsg.length < 600, 'one sentence of context, not the transcript');
  for (const url of ['/api/config', '/api/ai/status']) assert.ok(!(await (await realFetch(app.base + url)).text()).includes(KEY), `${url} hides the key`);
  const st = await (await realFetch(`${app.base}/api/ai/status`)).json();
  assert.equal(st.configured, true);
  assert.equal(st.model_available, true);
  // Same question again: answered from the cache, no new API call.
  calls = [];
  assert.equal((await post('figure it out', { line_id: line.id })).status, 200);
  assert.equal(calls.filter((c) => c.u.endsWith('/chat/completions')).length, 0);
});

test('explain: failures give clear Arabic messages', async () => {
  const cases = [
    [() => new Response('{}', { status: 401 }), /مفتاح OpenRouter غير صحيح/],
    [() => new Response('{}', { status: 402 }), /رصيد/],
    [() => new Response('{}', { status: 429 }), /مشغولة/],
    [() => new Response('{}', { status: 404 }), /النموذج/],
    [ok('not json at all'), /غير متوقعة/],
    [() => { throw new TypeError('network down'); }, /غير متاح/],
  ];
  for (const [i, [r, re]] of cases.entries()) {
    ai._resetAi();
    reply = r;
    const res = await post(`unique phrase number ${i}`);
    assert.ok(res.status >= 400, `case ${i}: ${res.status}`);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, re, `case ${i}: ${res.body.error}`);
  }
  assert.equal((await post('')).status, 400);
  assert.equal((await post('x'.repeat(301))).status, 413);
});

test('explain: missing OPENROUTER_API_KEY', async () => {
  delete process.env.OPENROUTER_API_KEY;
  try {
    const r = await post('another phrase entirely');
    assert.equal(r.status, 503);
    assert.match(r.body.error, /OPENROUTER_API_KEY/);
    const st = await (await realFetch(`${app.base}/api/ai/status`)).json();
    assert.equal(st.configured, false);
    assert.match(st.message, /OPENROUTER_API_KEY/);
  } finally {
    process.env.OPENROUTER_API_KEY = KEY;
  }
});

test('per-learner daily limit (cached answers are free)', async () => {
  reply = ok(GOOD);
  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await post(`limit test phrase ${i}`)).status);
  assert.ok(statuses.includes(429), statuses.join(','));
  const last = await post('limit test phrase 99');
  assert.match(last.body.error, /حد استخدام الذكاء الاصطناعي اليوم/);
  assert.equal((await post('limit test phrase 0')).status, 200, 'already answered → from cache');
});

test('usage report: tokens and cost from OpenRouter are counted per learner', async () => {
  reply = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(GOOD) }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 80, cost: 0.00042 } }), { status: 200 });
  const before = await (await realFetch(`${app.base}/api/ai/usage`)).json();
  ai._resetAi();
  // The daily limit test above may have used up today's calls: allow more for this check.
  process.env.AI_DAILY_LIMIT_PER_USER = '1000';
  assert.equal((await post('a brand new usage phrase')).status, 200);
  const after = await (await realFetch(`${app.base}/api/ai/usage`)).json();
  assert.equal(after.me.today.prompt_tokens - before.me.today.prompt_tokens, 120);
  assert.equal(after.me.today.completion_tokens - before.me.today.completion_tokens, 80);
  assert.ok(Math.abs(after.me.today.cost - before.me.today.cost - 0.00042) < 1e-9);
  assert.ok(after.site, 'local single user sees the site totals');
  assert.ok(!JSON.stringify(after).includes(KEY));
});
