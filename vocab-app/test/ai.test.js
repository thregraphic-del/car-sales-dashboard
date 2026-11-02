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
  // Out of credit: later requests (AI paused) keep telling the learner why.
  ai._resetAi();
  reply = () => new Response('{}', { status: 402 });
  await post('first after top-up check');
  calls = [];
  const again = await post('second while paused');
  assert.match(again.body.error, /رصيد OpenRouter خلص/);
  assert.equal(calls.length, 0, 'paused: no new API call');
  const st = await (await realFetch(`${app.base}/api/ai/status`)).json();
  assert.match(st.message, /رصيد/);
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

test('a video is translated once: re-adding it, or another learner adding it, costs no new AI calls', async () => {
  // OpenRouter mock: translate every "[idx] text" line it is sent.
  reply = () => {
    const sent = calls.at(-1).body.messages.at(-1).content;
    const lines = [...sent.matchAll(/^\[(\d+)\] (.*)$/gm)].map((m) => ({ i: Number(m[1]), ar: `ترجمة ${m[1]}` }));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ lines }) }, finish_reason: 'stop' }] }), { status: 200 });
  };
  process.env.AI_DAILY_LIMIT_PER_USER = '1000';
  const T = '0:01 First sentence here.\n0:05 Second sentence here.\n0:09 Third sentence here.';
  const add = async (body) => (await realFetch(`${app.base}/api/sources/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const step = async (id) => (await realFetch(`${app.base}/api/sources/${id}/translation`, { method: 'POST' })).json();
  const chats = () => calls.filter((c) => c.u.endsWith('/chat/completions')).length;
  ai._resetAi();
  const { source_id: id } = await add({ url: 'https://youtu.be/TRANSLATE01', transcript: T });
  for (let k = 0; k < 5 && !(await step(id)).complete; k += 1);
  const used = chats();
  assert.ok(used >= 1, 'first time: translated by AI');
  // Re-adding the same video (even with the transcript pasted again) keeps the subtitles.
  await add({ url: 'https://www.youtube.com/watch?v=TRANSLATE01', transcript: T });
  const again = await step(id);
  assert.equal(again.complete, true);
  assert.equal(chats(), used, 'no new AI call');
  const v = await (await realFetch(`${app.base}/api/sources/${id}`)).json();
  assert.ok(v.lines.every((l) => l.text_ar?.startsWith('ترجمة')));
  // Another learner adding the same video gets the existing subtitles.
  const { ensureUser } = await import('../server/data/users.js');
  const { saveSource, sourceLines } = await import('../server/data/sources.js');
  await ensureUser(77);
  const other = await saveSource({ kind: 'youtube', youtube_id: 'TRANSLATE01', title: 'x' }, v.lines.map((l, i) => ({ idx: i, start: l.start_seconds, text: l.text })), [], 77);
  assert.ok((await sourceLines(other)).every((l) => l.text_ar?.startsWith('ترجمة')));
  assert.equal(chats(), used);
});

test('word forms: verb/noun/adjective with examples, cached, input sanitised', async () => {
  reply = ok({ base: 'decide', forms: [
    { pos: 'فعل', word: 'decide', form: 'decide', arabic: 'يقرر', example: 'I decided to stay.', example_ar: 'قررت البقاء.' },
    { pos: 'اسم', word: 'decision', form: 'decision', arabic: 'قرار', example: 'It was a hard decision.', example_ar: 'كان قرارًا صعبًا.' },
    { pos: 'صفة', word: 'decisive', form: 'decisive', arabic: 'حاسم', example: 'She is decisive.', example_ar: 'هي حاسمة.' },
  ] });
  const get = async (w) => { const r = await realFetch(`${app.base}/api/ai/forms?word=${encodeURIComponent(w)}`); return { status: r.status, body: await r.json() }; };
  const r = await get('Decide');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.forms.map((f) => f.pos), ['فعل', 'اسم', 'صفة']);
  assert.equal(r.body.forms[1].example, 'It was a hard decision.');
  assert.match(calls.find((c) => c.u.endsWith('/chat/completions')).body.messages.at(-1).content, /Word: decide$/);
  calls = [];
  assert.equal((await get('decide')).status, 200);
  assert.equal(calls.filter((c) => c.u.endsWith('/chat/completions')).length, 0, 'cached');
  assert.equal((await get('<<>>')).status, 400);
});

const postJson = async (path, body) => {
  const res = await realFetch(`${app.base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('story: uses the learner\'s words and returns sentences with Arabic', async () => {
  reply = ok({ title: 'A Busy Day', title_ar: 'يوم مزدحم', sentences: [{ en: 'Sara was reluctant to start.', ar: 'كانت سارة مترددة في البدء.' }, { en: 'Then she figured it out.', ar: 'ثم فهمت الأمر.' }] });
  const words = await (await realFetch(`${app.base}/api/words`)).json();
  if (words.length < 3) return; // demo data has saved words
  const r = await postJson('/api/ai/story', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.sentences.length, 2);
  assert.equal(r.body.sentences[0].ar, 'كانت سارة مترددة في البدء.');
  assert.ok(r.body.words.length >= 3 && r.body.words.length <= 10);
  const sent = calls.find((c) => c.u.endsWith('/chat/completions')).body.messages.at(-1).content;
  assert.ok(r.body.words.every((w) => sent.includes(w.term)), 'the story is asked with the learner\'s words');
});

test('extract: photo and PDF are sent as attachments; result is cleaned', async () => {
  reply = ok({ items: [{ term: 'accurate', arabic: 'دقيق', level: 'B1' }, { term: 'Accurate', arabic: 'دقيق', level: 'B1' }, { term: 'رقم', arabic: 'x', level: 'A1' }, { term: 'figure out', arabic: 'يفهم', level: 'B1' }] });
  const img = await postJson('/api/ai/extract', { kind: 'image', data: 'data:image/jpeg;base64,/9j/AAAA', name: 'page.jpg' });
  assert.equal(img.status, 200);
  assert.deepEqual(img.body.items.map((i) => i.term), ['accurate', 'figure out']);
  const msg = calls.find((c) => c.u.endsWith('/chat/completions')).body.messages.at(-1).content;
  assert.equal(msg[1].type, 'image_url');
  calls = [];
  const pdf = await postJson('/api/ai/extract', { kind: 'pdf', data: 'data:application/pdf;base64,JVBERi0x', name: 'words.pdf' });
  assert.equal(pdf.status, 200);
  const body = calls.find((c) => c.u.endsWith('/chat/completions')).body;
  assert.equal(body.messages.at(-1).content[1].type, 'file');
  assert.equal(body.plugins[0].id, 'file-parser');
  assert.equal((await postJson('/api/ai/extract', { kind: 'exe', data: 'x' })).status, 400);
  assert.equal((await postJson('/api/ai/extract', { kind: 'image', data: 'data:text/html;base64,AAAA' })).status, 400);
});

test('video ideas: only videos that exist on YouTube are shown; search links keep the length', async () => {
  reply = ok({
    topics: [{ query: 'how to focus at work', label_ar: 'التركيز في العمل' }],
    videos: [
      { title: 'Real talk', channel: 'TED', youtube_id: 'AAAAAAAAAAA', minutes: 12, why_ar: 'مناسب' },
      { title: 'Made up', channel: 'X', youtube_id: 'BBBBBBBBBBB', minutes: 9, why_ar: 'مناسب' },
      { title: 'Bad id', channel: 'X', youtube_id: 'short', minutes: 9, why_ar: '' },
    ],
  });
  const before = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://www.youtube.com/oembed')) {
      return u.includes('AAAAAAAAAAA')
        ? new Response(JSON.stringify({ title: 'The real title', author_name: 'TED' }), { status: 200 })
        : new Response('Not Found', { status: 404 });
    }
    return before(url, opts);
  };
  try {
    const res = await realFetch(`${app.base}/api/ai/suggest-videos?duration=medium`);
    const r = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(r.videos.map((v) => v.youtube_id), ['AAAAAAAAAAA']);
    assert.equal(r.videos[0].title, 'The real title');
    assert.match(r.topics[0].url, /search_query=how%20to%20focus%20at%20work&sp=EgIYAw/);
  } finally {
    globalThis.fetch = before;
  }
});

test('watch progress: saved per video and returned with the source', async () => {
  const put = (id, seconds) => realFetch(`${app.base}/api/sources/${id}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds }) });
  assert.equal((await put(1, 123.45)).status, 200);
  const v = await (await realFetch(`${app.base}/api/sources/1`)).json();
  assert.equal(Number(v.source.progress_seconds), 123.5);
  assert.equal((await put(1, -5)).status, 400);
  assert.equal((await put(99999, 10)).status, 404);
});

test('alignment: phrases map exactly onto the line; a bad split keeps the normal layout', async () => {
  const v = await (await realFetch(`${app.base}/api/sources/2`)).json();
  const [a, b] = v.lines;
  const split = (t) => {
    const ws = t.split(/\s+/);
    return [{ en: ws.slice(0, 2).join(' '), ar: 'الأولى' }, { en: ws.slice(2).join(' '), ar: 'الثانية' }];
  };
  reply = ok({ lines: [{ i: a.idx, chunks: split(a.text) }, { i: b.idx, chunks: [{ en: 'totally different words', ar: 'x' }] }] });
  const r = await postJson(`/api/sources/2/align`, { from: a.idx });
  assert.equal(r.status, 200);
  const ra = r.body.lines.find((l) => l.id === a.id);
  const rb = r.body.lines.find((l) => l.id === b.id);
  assert.equal(ra.align.length, 2);
  assert.equal(ra.align[0][0], 0);
  assert.equal(ra.align[1][1], a.text.length);
  assert.equal(a.text.slice(ra.align[0][0], ra.align[0][1]).trim(), a.text.split(/\s+/).slice(0, 2).join(' '));
  assert.equal(rb.align, null, 'words changed by the AI → no alignment');
  const again = await (await realFetch(`${app.base}/api/sources/2`)).json();
  assert.deepEqual(again.lines.find((l) => l.id === a.id).align, ra.align, 'stored');
  assert.equal(again.lines.find((l) => l.id === b.id).align, null);
  calls = [];
  const next = await postJson(`/api/sources/2/align`, { from: a.idx });
  const asked = calls.find((c) => c.u.endsWith('/chat/completions'))?.body.messages.at(-1).content || '';
  assert.ok(!asked.includes(`[${a.idx}] `) && !asked.includes(`[${b.idx}] `), 'aligned (or failed) lines are not asked again');
  assert.equal(next.status, 200);
});

test('suggest words: never returns words the learner already has', async () => {
  const mine = await (await realFetch(`${app.base}/api/words`)).json();
  const have = mine[0].term;
  reply = ok({ items: [
    { term: have, arabic: 'x', level: 'B1', example: '', example_ar: '' },
    { term: 'meticulous', arabic: 'دقيق جدًا', level: 'C1', example: 'She is meticulous about details.', example_ar: 'هي دقيقة جدًا في التفاصيل.' },
    { term: 'Meticulous', arabic: 'دقيق', level: 'C1', example: '', example_ar: '' },
  ] });
  const r = await postJson('/api/ai/suggest-words', { count: 10, topic: 'business' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((i) => i.term), ['meticulous']);
  const asked = calls.find((c) => c.u.endsWith('/chat/completions')).body.messages.at(-1).content;
  assert.match(asked, /Field: business/);
  assert.ok(asked.includes(have), 'existing words are listed to avoid');
});

test('story: last week / number of words', async () => {
  reply = ok({ title: 'T', title_ar: 'ع', sentences: [{ en: 'One.', ar: 'واحد.' }] });
  const r = await postJson('/api/ai/story', { count: 20 });
  assert.equal(r.status, 200);
  assert.ok(r.body.words.length <= 20);
  const w = await postJson('/api/ai/story', { range: 'week', count: 30 });
  assert.ok([200, 400].includes(w.status));
});

test('alignment: the AI renumbering lines still works (matched in order)', async () => {
  const v = await (await realFetch(`${app.base}/api/sources/3`)).json();
  const batch = v.lines.slice(0, 12);
  reply = ok({ lines: batch.map((l, k) => ({ i: k + 1, chunks: [{ en: l.text, ar: `ترجمة ${k}` }] })) });
  const r = await postJson('/api/sources/3/align', { from: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.body.lines.filter((l) => l.align).length, batch.length);
});

test('preparing a video (alignment) never uses up the daily AI limit', async () => {
  const before = process.env.AI_DAILY_LIMIT_PER_USER;
  process.env.AI_DAILY_LIMIT_PER_USER = '1';
  try {
    reply = ok({ arabic: 'x', explanation: 'x', simple_english: 'x', grammar_note: '', key_words: [] });
    await post('use the only call left today');
    assert.equal((await post('one more explanation today')).status, 429, 'the daily limit applies to explanations');
    const v = await (await realFetch(`${app.base}/api/sources/1`)).json();
    const l = v.lines.find((x) => !x.align);
    reply = ok({ lines: [{ i: l.idx, chunks: [{ en: l.text, ar: 'ترجمة' }] }] });
    calls = [];
    const r = await postJson('/api/sources/1/align', { from: l.idx });
    assert.equal(r.status, 200);
    assert.ok(!r.body.ai_error, r.body.ai_error);
    assert.ok(calls.some((c) => c.u.endsWith('/chat/completions')), 'alignment still asks the AI');
  } finally {
    process.env.AI_DAILY_LIMIT_PER_USER = before;
  }
});

test('built-in dictionary: built once with AI, then words and their forms need no AI', async () => {
  process.env.DICTIONARY_BUILD_KEY = 'test-dictionary-key-123456';
  const { COMMON_WORDS } = await import('../server/lib/common-words.js');
  const [w1, w2, w3] = COMMON_WORDS;
  reply = ok({ items: [
    { input: w1, skip: true, lemma: '', part_of_speech: '', level: 'A1', arabic: '', simple_english: '', pronunciation: '', example: '', example_ar: '', inflections: [], family: [] },
    { input: w2, skip: false, lemma: 'thrive', part_of_speech: 'verb', level: 'B2', arabic: 'يزدهر / ينجح', simple_english: 'to grow well', pronunciation: '/θraɪv/', example: 'Plants thrive in the sun.', example_ar: 'تزدهر النباتات في الشمس.', inflections: ['thrives', 'thrived', 'throve', 'thriving'], family: [{ pos: 'صفة', word: 'thriving', arabic: 'مزدهر' }] },
    { input: w3, skip: false, lemma: 'meticulous', part_of_speech: 'adjective', level: 'C1', arabic: 'دقيق جدًا', simple_english: 'very careful', pronunciation: '/məˈtɪkjələs/', example: 'She is meticulous.', example_ar: 'هي دقيقة جدًا.', inflections: [], family: [{ pos: 'ظرف', word: 'meticulously', arabic: 'بدقة شديدة' }] },
  ] });
  const build = (body) => realFetch(`${app.base}/api/internal/dictionary`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dictionary-key': process.env.DICTIONARY_BUILD_KEY }, body: JSON.stringify(body) });
  assert.equal((await realFetch(`${app.base}/api/internal/dictionary`, { method: 'POST' })).status, 403, 'needs the key');
  const r = await (await build({ offset: 0, count: 3 })).json();
  assert.equal(r.processed, 3);
  calls = [];
  const look = await (await realFetch(`${app.base}/api/lookup?word=throve`)).json();
  assert.equal(look.found, true);
  assert.equal(look.term, 'thrive');
  assert.match(look.arabic, /يزدهر/);
  const forms = await (await realFetch(`${app.base}/api/ai/forms?word=meticulous`)).json();
  assert.deepEqual(forms.forms.map((f) => f.word), ['meticulous', 'meticulously']);
  assert.equal(calls.filter((c) => c.u.endsWith('/chat/completions')).length, 0, 'no AI after the dictionary is built');
  calls = [];
  await build({ offset: 0, count: 3 });
  const asked = calls.find((c) => c.u.endsWith('/chat/completions')).body.messages.at(-1).content.split('\n');
  assert.ok(![w1, w2, w3].some((w) => asked.includes(w)), 'processed words are not asked again; the next ones are');
  assert.deepEqual(asked, COMMON_WORDS.slice(3, 6));
  delete process.env.DICTIONARY_BUILD_KEY;
});

test('voice: clear free natural voice through the server, long text in parts, browser voice if it fails', async () => {
  const before = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://translate.google.com/translate_tts')) {
      asked.push(new URL(u).searchParams);
      return new Response(Buffer.from([0xff, 0xf3, 0x44, 0xc4]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
    return before(url, opts);
  };
  try {
    const cfg = await (await realFetch(`${app.base}/api/config`)).json();
    assert.equal(cfg.tts.server, true);
    assert.equal(cfg.tts.provider, 'google-free');
    const word = `obligation${Math.random().toString(36).slice(2, 8)}`; // saved sounds are reused, so a new word each run
    const res = await realFetch(`${app.base}/api/tts?text=${word}&lang=en`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /audio\/mpeg/);
    assert.equal(asked[0].get('tl'), 'en-US');
    assert.equal(asked[0].get('q'), word);
    asked.length = 0;
    const long = `${word} is a long sentence that keeps going, with many words in it. `.repeat(5);
    assert.equal((await realFetch(`${app.base}/api/tts?${new URLSearchParams({ text: long, lang: 'en' })}`)).status, 200);
    assert.ok(asked.length >= 2 && asked.every((q) => q.get('q').length <= 190), 'split into parts');
    assert.equal((await realFetch(`${app.base}/api/tts?${new URLSearchParams({ text: `التزام ${word}`, lang: 'ar' })}`)).status, 200);
    assert.equal(asked.at(-1).get('tl'), 'ar');
    globalThis.fetch = async (url, opts) => (String(url).includes('translate_tts') ? new Response('no', { status: 429 }) : before(url, opts));
    assert.equal((await realFetch(`${app.base}/api/tts?text=other${word}&lang=en`)).status, 502, 'client then uses the browser voice');
  } finally {
    globalThis.fetch = before;
  }
});

test('video: dictionary words become suggestions, practice from the video, goal counts opened words but not "save all"', async () => {
  const { run, all, get } = await import('../server/db/index.js');
  const src = (await (await realFetch(`${app.base}/api/sources`)).json()).find((s) => !s.is_demo) || (await (await realFetch(`${app.base}/api/sources`)).json())[0];
  await run('UPDATE sources SET is_demo = 0 WHERE id = ?', src.id);
  const view = await (await realFetch(`${app.base}/api/sources/${src.id}`)).json();
  // put two words of this transcript into the built-in dictionary
  const words = [...new Set(view.lines.flatMap((l) => l.text.toLowerCase().match(/[a-z]{6,}/g) || []))].slice(0, 2);
  for (const w of words) {
    if (!(await get('SELECT id FROM vocabulary WHERE term = ?', w))) await run("INSERT INTO vocabulary (term, match_key, arabic, level, origin) VALUES (?, ?, 'معنى', 'B1', 'dictionary')", w, w);
    else await run("UPDATE vocabulary SET origin = 'dictionary', arabic = COALESCE(arabic, 'معنى') WHERE term = ?", w);
    await run('INSERT INTO lemma_index (form, lemma) VALUES (?, ?) ON CONFLICT (form) DO NOTHING', w, w);
  }
  await run("DELETE FROM occurrences WHERE source_id = ? AND vocabulary_id IN (SELECT id FROM vocabulary WHERE term IN (?, ?))", src.id, words[0], words[1]);
  const r = await postJson(`/api/sources/${src.id}/dictionary-words`, {});
  assert.equal(r.status, 200);
  assert.ok(r.body.added >= 1, JSON.stringify(r.body));
  const after = await (await realFetch(`${app.base}/api/sources/${src.id}`)).json();
  assert.ok(after.items.some((i) => words.includes(i.term)), 'dictionary words suggested');
  assert.ok(after.marks.some((m) => m.light), 'shown with a light mark');
  assert.ok(after.source.dict_words_at);
  // practice the video's words, saved or not
  const p = await (await realFetch(`${app.base}/api/practice?source_id=${src.id}&size=50`)).json();
  assert.ok(p.words.length >= 1);
  assert.ok(p.words.some((w) => w.uv_id < 0) || p.words.every((w) => w.uv_id > 0));
  // goal: opening a word in a video counts once; "save all" (bulk) never counts
  const before = (await (await realFetch(`${app.base}/api/today`)).json()).watch_goal.count;
  const item = after.items.find((i) => !i.user_state);
  const look = await (await realFetch(`${app.base}/api/lookup?vocabulary_id=${item.vocabulary_id}&line_id=${item.line_id}`)).json();
  assert.equal(look.goal.count, before + 1);
  await realFetch(`${app.base}/api/lookup?vocabulary_id=${item.vocabulary_id}&line_id=${item.line_id}`);
  const bulk = await postJson('/api/words/bulk', { items: after.items.filter((i) => !i.user_state && i !== item).slice(0, 5).map((i) => ({ vocabulary_id: i.vocabulary_id, occurrence_id: i.occurrence_id })) });
  assert.equal(bulk.status, 200);
  assert.equal((await (await realFetch(`${app.base}/api/today`)).json()).watch_goal.count, before + 1, 'same word twice and "save all" do not count');
});

test('summary and channels', async () => {
  reply = ok({ idea: 'فكرة', benefit: 'فائدة', points: ['نقطة'], steps: ['خطوة'], quotes: [{ en: 'Hi everyone', ar: 'مرحبًا' }] });
  const s = await postJson('/api/sources/1/summary', {});
  assert.equal(s.status, 200);
  assert.equal(s.body.steps[0], 'خطوة');
  const ch = await (await realFetch(`${app.base}/api/channels`)).json();
  assert.ok(ch.channels.filter((c) => c.kind === 'fixed').length >= 10, 'two known channels in five fields');
  const ted = ch.channels.find((c) => c.handle === 'TED');
  assert.equal((await postJson('/api/channels', { action: 'pin', id: ted.id })).status, 200);
  assert.equal((await postJson('/api/channels', { action: 'add', name: 'My Channel', handle: '@mychannel' })).status, 200);
  assert.equal((await postJson('/api/channels', { action: 'hide', id: '@veritasium' })).status, 200);
  const ch2 = (await (await realFetch(`${app.base}/api/channels`)).json()).channels;
  assert.ok(ch2.find((c) => c.handle === 'TED').pinned);
  assert.ok(ch2.find((c) => c.handle === 'mychannel'));
  assert.ok(ch2.find((c) => c.handle === 'veritasium').hidden);
  assert.ok(ch2.findIndex((c) => c.pinned) === 0, 'pinned first');
});

test('video: suggested words are shown in their simplest form (appearance → appear), strictly', async () => {
  const { run, get } = await import('../server/db/index.js');
  const { cacheKey, writeCache } = await import('../server/services/ai.js');
  const src = (await (await realFetch(`${app.base}/api/sources`)).json())[0];
  await run('UPDATE sources SET is_demo = 0 WHERE id = ?', src.id);
  const line = (await (await realFetch(`${app.base}/api/sources/${src.id}`)).json()).lines[0];
  const add = async (term, level, pos) => {
    await run("INSERT INTO vocabulary (term, match_key, arabic, level, part_of_speech, origin) VALUES (?, ?, 'معنى', ?, ?, 'dictionary') ON CONFLICT (match_key) DO NOTHING", term, term, level, pos);
    await run("UPDATE vocabulary SET level = ?, part_of_speech = ?, origin = 'dictionary', arabic = 'معنى' WHERE match_key = ?", level, pos, term);
    return (await get('SELECT id FROM vocabulary WHERE match_key = ?', term)).id;
  };
  await add('appear', 'A2', 'verb');
  const appearance = await add('appearance', 'B1', 'noun');
  const integrity = await add('integrity', 'C1', 'noun'); // its family says "integral", but that is not the verb it comes from
  await add('decide', 'A2', 'verb');
  const decision = await add('decision', 'B1', 'noun');
  await add('import', 'B1', 'verb');
  const importance = await add('importance', 'B1', 'noun'); // looks like import + ance, but not one family
  await add('improve', 'A2', 'verb');
  const improvement = await add('improvement', 'B1', 'noun'); // no family data at all: the rules decide
  await writeCache(cacheKey('word_forms_v2', 'Word: decide'), 'word_forms_v2', { base: 'decide', forms: [{ pos: 'فعل', word: 'decide', arabic: 'يقرر' }, { pos: 'اسم', word: 'decision', arabic: 'قرار' }] });
  await writeCache(cacheKey('word_forms_v2', 'Word: appear'), 'word_forms_v2', { base: 'appear', forms: [{ pos: 'فعل', word: 'appear', arabic: 'يظهر' }, { pos: 'اسم', word: 'appearance', arabic: 'مظهر' }] });
  await writeCache(cacheKey('word_forms_v2', 'Word: integrity'), 'word_forms_v2', { base: 'integrity', forms: [{ pos: 'اسم', word: 'integrity', arabic: 'نزاهة' }, { pos: 'صفة', word: 'integral', arabic: 'أساسي' }] });
  for (const v of [appearance, integrity, decision, importance, improvement]) {
    await run('INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, contextual_meaning, suggested, rank) VALUES (?, ?, ?, 0, 3, ?, ?, 1, 5)', v, src.id, line.id, line.text, 'مظهر');
  }
  const dry = await postJson(`/api/sources/${src.id}/dictionary-words`, { dry: true });
  assert.deepEqual(dry.body.changes.sort(), ['appearance→appear', 'decision→decide', 'improvement→improve']);
  const r = await postJson(`/api/sources/${src.id}/dictionary-words`, {});
  assert.equal(r.status, 200);
  assert.ok(r.body.simplified >= 1, JSON.stringify(r.body));
  const view = await (await realFetch(`${app.base}/api/sources/${src.id}`)).json();
  const terms = view.items.map((i) => i.term);
  assert.ok(terms.includes('appear'), 'shown as the simplest form');
  assert.ok(!terms.includes('appearance'));
  assert.ok(terms.includes('integrity'), 'not changed to a different word');
  assert.ok(terms.includes('decide') && !terms.includes('decision'));
  assert.ok(terms.includes('importance'));
  // clicking "decision" anywhere shows (and saves) "decide"
  const look = await (await realFetch(`${app.base}/api/lookup?word=decision`)).json();
  assert.equal(look.term, 'decide', JSON.stringify(look).slice(0, 200));
  assert.equal(view.items.find((i) => i.term === 'appear').arabic, 'معنى', 'meaning of the simple form, not of the long one');
  assert.equal(view.source.simplified, true);
});
