// An Arabic text pasted in «نصوص» is translated to English first (the Arabic stays beside it); an English text goes as before.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-artext-');
process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-key-arabic-0000';
process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
delete process.env.SESSION_SECRET;

const realFetch = globalThis.fetch;
let asked = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://openrouter.ai')) return realFetch(url, opts);
  if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-4o-mini' }] }), { status: 200 });
  const body = JSON.parse(opts.body);
  const user = body.messages.at(-1).content;
  asked.push({ task: body.response_format?.json_schema?.name, user });
  const lines = [...user.matchAll(/^\[(\d+)\] (.+)$/gm)].map((m) => ({ i: Number(m[1]), en: `English ${m[1]}` }));
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ lines }) }, finish_reason: 'stop' }] }), { status: 200 });
};

let app;
before(async () => { app = await startApp(); });
beforeEach(() => { asked = []; });
after(async () => { globalThis.fetch = realFetch; await app?.close(); db.cleanup(); delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; });

const post = async (path, body) => {
  const res = await realFetch(app.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('Arabic text: translated to English first, the Arabic kept beside each line', async () => {
  const text = 'هذا مؤسس إنفيديا اعترف بأنه خان زوجته. والمرأة اتهمت بأنها جاسوسة صينية.\nوخلال ثلاث وثلاثين سنة بنى أغلى شركة وجدت في التاريخ.';
  const r = await post('/api/sources/text', { text, title: 'قصة' });
  assert.equal(r.status, 200);
  assert.equal(asked.length, 1, 'one AI request for the three short lines');
  assert.ok(asked[0].user.includes('هذا مؤسس'), 'the Arabic lines are what is translated');
  const view = await (await realFetch(`${app.base}/api/sources/${r.body.source_id}`)).json();
  assert.equal(view.lines.length, 3);
  assert.ok(view.lines.every((l) => /^English \d+$/.test(l.text)), 'the English column holds the translation');
  assert.ok(view.lines[0].text_ar.startsWith('هذا مؤسس'), 'the Arabic original stays in the Arabic column');
});

test('English text: no translation call to English, as before', async () => {
  const r = await post('/api/sources/text', { text: 'The cat sat on the warm mat. It was a very quiet afternoon.', title: 'Cat' });
  assert.equal(r.status, 200);
  assert.ok(!asked.some((a) => a.task === 'translate_ar_en_v1'));
});

test('an Arabic text that is too long is refused with a clear message', async () => {
  const r = await post('/api/sources/text', { text: 'جملة عربية قصيرة جدا هنا. '.repeat(400) });
  assert.equal(r.status, 413);
  assert.match(r.body.error, /النص العربي طويل/);
});

test('an Arabic YouTube transcript is refused with a clear message', async () => {
  const transcript = '0:00 هذا مؤسس إنفيديا اعترف بأنه خان زوجته\n0:04 والمرأة اتهمت بأنها جاسوسة صينية وخلال ثلاث وثلاثين سنة بنى أغلى شركة';
  const r = await post('/api/sources/youtube', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', transcript });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /بالعربي/);
});

test('the «أضف» box: an Arabic paragraph becomes a translated text, not a list of unclear lines', async () => {
  const text = 'هذا مؤسس إنفيديا اعترف بأنه خان زوجته. والمرأة اتهمت بأنها جاسوسة صينية.\nوخلال ثلاث وثلاثين سنة بنى أغلى شركة وجدت في التاريخ.';
  const r = await post('/api/import/preview', { text });
  assert.equal(r.status, 200);
  assert.ok(r.body.source?.id, 'a text was made');
  assert.deepEqual(r.body.unclear, []);
  const view = await (await realFetch(`${app.base}/api/sources/${r.body.source.id}`)).json();
  assert.ok(view.lines.every((l) => /^English \d+$/.test(l.text) && /[؀-ۿ]/.test(l.text_ar)));
});
