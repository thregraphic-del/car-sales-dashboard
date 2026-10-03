// OpenRouter integration, with OpenRouter's HTTP API simulated locally.
// Proves: dictionary first, the sentence is sent, results are cached, offline
// fallback works, and the key never reaches the browser.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexitube-or-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.OPENROUTER_API_KEY = 'sk-or-test-not-a-real-key';
process.env.OPENROUTER_MODEL = 'test/model';

const realFetch = globalThis.fetch;
const calls = [];
let mode = 'ok'; // ok | down | schema400
globalThis.fetch = async (url, opts) => {
  if (!String(url).startsWith('https://openrouter.ai/api/v1')) return realFetch(url, opts);
  const body = JSON.parse(opts.body);
  calls.push({ url: String(url), headers: opts.headers, body });
  if (mode === 'down') throw new TypeError('fetch failed');
  if (mode === 'schema400' && body.response_format?.type === 'json_schema') {
    return new Response(JSON.stringify({ error: { message: 'json_schema not supported' } }), { status: 400 });
  }
  const user = body.messages.at(-1).content;
  let content;
  if (/Clicked word:/.test(user)) {
    const word = user.match(/Clicked word: (.*)/)[1];
    content = {
      term: word.toLowerCase(), item_type: 'word', part_of_speech: 'noun', level: 'B2', band: 'useful', pronunciation: '/x/',
      arabic: 'إيرادات (في هذه الجملة)', arabic_general: 'إيرادات', simple_english: 'money a company earns', sentence_arabic: 'ترجمة الجملة',
      context_note: 'هنا تعني المال الذي تجنيه الشركة', topic: 'finance', example: 'Revenue grew by 10%.', example_arabic: 'نمت الإيرادات 10٪.',
      easy_example: 'Our revenue is up.', easy_example_arabic: 'إيراداتنا ارتفعت.', similar: [],
    };
  } else if (/<transcript>/.test(user)) {
    content = { items: [] };
  } else {
    content = { lines: [] };
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(content)}\n\`\`\`` }, finish_reason: 'stop' }] }), { status: 200 });
};

let server;
let base;
const call = async (url) => (await (await realFetch(base + url)).json());

before(async () => {
  const { app } = await import('../server/index.js');
  const { seedIfEmpty } = await import('../server/seed.js');
  seedIfEmpty();
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  globalThis.fetch = realFetch;
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  calls.length = 0;
  mode = 'ok';
  (await import('../server/ai.js'))._resetAi();
});

async function demoLine(re) {
  const v = await call('/api/sources/1');
  return v.lines.find((l) => re.test(l.text));
}

test('config exposes provider and model, never the key', async () => {
  const cfg = await call('/api/config');
  assert.equal(cfg.ai.provider, 'openrouter');
  assert.equal(cfg.ai.model, 'test/model');
  assert.equal(cfg.ai.configured, true);
  assert.ok(!JSON.stringify(cfg).includes('sk-or-test'), 'API key must not be sent to the browser');
});

test('dictionary first: a word the dictionary fully knows does not call OpenRouter', async () => {
  const line = await demoLine(/reluctant/);
  const r = await call(`/api/lookup?line_id=${line.id}&word=reluctant`);
  assert.equal(r.found, true);
  assert.equal(calls.length, 0);
});

test('unknown word: OpenRouter gets the actual sentence; result is cached and stored', async () => {
  const line = await demoLine(/meetings/);
  const r = await call(`/api/lookup?line_id=${line.id}&word=meetings`);
  assert.equal(calls.length, 1);
  const sent = calls[0];
  assert.equal(sent.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(sent.headers.Authorization, 'Bearer sk-or-test-not-a-real-key');
  assert.equal(sent.body.model, 'test/model');
  assert.match(sent.body.messages.at(-1).content, new RegExp(`Sentence: ${line.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal(r.found, true);
  assert.equal(r.arabic, 'إيرادات (في هذه الجملة)', 'meaning in context');
  assert.equal(r.context_note, 'هنا تعني المال الذي تجنيه الشركة');
  assert.equal(r.level, 'B2');
  assert.equal(r.part_of_speech, 'noun');
  assert.equal(r.simple_english, 'money a company earns');
  assert.ok(r.examples.some((e) => e.sentence === 'Revenue grew by 10%.'));
  assert.equal(r.context_arabic, 'ترجمة الجملة');

  const again = await call(`/api/lookup?line_id=${line.id}&word=meetings`);
  assert.equal(calls.length, 1, 'second click: no new API call');
  assert.equal(again.arabic, r.arabic);
});

test('"explain in this sentence" calls AI once for a dictionary word, then never again', async () => {
  const line = await demoLine(/prioritize/);
  const first = await call(`/api/lookup?line_id=${line.id}&word=prioritize`);
  assert.equal(calls.length, 0);
  assert.equal(first.can_explain, false, 'demo occurrence already has a contextual meaning');
  const other = await demoLine(/three most important tasks/);
  const r1 = await call(`/api/lookup?line_id=${other.id}&word=important`);
  assert.equal(calls.length, 1, 'basic words without a dictionary entry go to AI');
  const r2 = await call(`/api/lookup?line_id=${other.id}&vocabulary_id=${r1.vocabulary_id}&context=1`);
  assert.equal(calls.length, 1, 'already explained in this sentence → cached');
  assert.equal(r2.contextual, true);
});

test('OpenRouter down: lookup still works offline with a friendly message', async () => {
  mode = 'down';
  const line = await demoLine(/Write your three/);
  const r = await call(`/api/lookup?line_id=${line.id}&word=paper`);
  assert.equal(r.found, false);
  assert.equal(r.ai_error, 'شرح الذكاء الاصطناعي غير متاح — نستخدم القاموس المحلي.');
  const known = await call(`/api/lookup?line_id=${line.id}&word=reluctant`);
  assert.equal(known.found, true, 'dictionary keeps working');
  const cfg = await call('/api/config');
  assert.equal(cfg.ai.available, false, 'paused after a network failure');
});

test('models without JSON-schema support fall back to JSON mode', async () => {
  mode = 'schema400';
  const line = await demoLine(/first simple rule/);
  const r = await call(`/api/lookup?line_id=${line.id}&word=rule`);
  assert.equal(r.found, true);
  assert.deepEqual(calls.map((c) => c.body.response_format?.type), ['json_schema', 'json_object']);
});

test('video analysis falls back to the offline dictionary when OpenRouter fails', async () => {
  mode = 'down';
  const res = await realFetch(`${base}/api/sources/youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://youtu.be/CCCCCCCCCCC', transcript: '0:01 I was reluctant to take my health for granted.\n0:09 We had to figure it out before the deadline came.' }),
  });
  const r = await res.json();
  assert.equal(res.status, 200);
  assert.ok(r.ai_error);
  const v = await call(`/api/sources/${r.source_id}`);
  assert.equal(v.source.extractor, 'dictionary');
  assert.ok(v.items.length > 0);
});
