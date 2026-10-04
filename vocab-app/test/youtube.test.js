// YouTube: links, caption formats, language choice, failure reasons and the
// fallback chain — with YouTube mocked (no network), plus the API storing
// word timings for live highlighting.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, startApp } from './helpers.js';

const db = freshDatabase('lexitube-yt-');
delete process.env.OPENROUTER_API_KEY;
delete process.env.SESSION_SECRET;
process.env.YOUTUBE_BUDGET_MS = '20000';
const yt = await import('../server/lib/youtube.js');
const { toSentences } = await import('../server/services/extractor.js');

/* ------------------------------------------------------------- pure parts */

test('video id from every common link form', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s&list=PL123&index=3`,
    `https://www.youtube.com/watch?feature=share&v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&si=abc`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=Xyz123&t=10`,
    `youtu.be/${id}`,
    `www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}?start=5`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
    `https://www.youtube.com/attribution_link?u=/watch%3Fv%3D${id}%26feature%3Dshare`,
  ]) assert.equal(yt.parseYoutubeId(url), id, url);
  for (const bad of ['', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/channel/UC123', 'not a link', 'https://youtu.be/']) {
    assert.equal(yt.parseYoutubeId(bad), null, bad);
  }
});

test('caption formats: json3 (manual and auto with word times), srv1 and srv3 XML', () => {
  const manual = yt.parseCaptions(JSON.stringify({ events: [
    { tStartMs: 1000, dDurationMs: 2500, segs: [{ utf8: 'Hello &amp; welcome.' }] },
    { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: '\n' }] },
    { tStartMs: 6000, dDurationMs: 1000, segs: [{ utf8: 'Second line' }] },
  ] }));
  assert.deepEqual(manual.map((s) => [s.start, s.text, s.words]), [[1, 'Hello &amp; welcome.', undefined], [6, 'Second line', undefined]]);
  const auto = yt.parseCaptions(JSON.stringify({ events: [
    { tStartMs: 0, dDurationMs: 9000, id: 1, wpWinPosId: 1 },
    { tStartMs: 1200, dDurationMs: 3000, wWinId: 1, segs: [{ utf8: 'today' }, { utf8: ' I', tOffsetMs: 400 }, { utf8: ' want', tOffsetMs: 700 }] },
    { tStartMs: 4100, dDurationMs: 30, aAppend: 1, segs: [{ utf8: '\n' }] },
    { tStartMs: 4200, dDurationMs: 2000, wWinId: 1, segs: [{ utf8: 'data' }] },
  ] }), { wordLevel: true });
  assert.deepEqual(auto[0].words, [{ t: 1.2, text: 'today' }, { t: 1.6, text: 'I' }, { t: 1.9, text: 'want' }]);
  assert.deepEqual(auto[1].words, [{ t: 4.2, text: 'data' }]);
  const srv1 = yt.parseCaptions('<transcript><text start="1.5" dur="2">It&#39;s &quot;fine&quot;</text><text start="4" dur="1">Next</text></transcript>');
  assert.deepEqual(srv1.map((s) => [s.start, s.text]), [[1.5, 'It\'s "fine"'], [4, 'Next']]);
  const srv3 = yt.parseCaptions('<timedtext><body><p t="2000" d="1500">Three <s>parts</s></p></body></timedtext>');
  assert.deepEqual(srv3.map((s) => [s.start, s.dur, s.text]), [[2, 1.5, 'Three parts']]);
});

test('track choice: English human → English auto → translated → original', () => {
  const en = { languageCode: 'en', baseUrl: 'a' };
  const enAuto = { languageCode: 'en', kind: 'asr', baseUrl: 'b' };
  const ar = { languageCode: 'ar', baseUrl: 'c', isTranslatable: true };
  const fr = { languageCode: 'fr', baseUrl: 'd' };
  assert.equal(yt.chooseTrack([enAuto, ar, en]).track, en);
  assert.equal(yt.chooseTrack([ar, enAuto]).track, enAuto);
  assert.deepEqual(yt.chooseTrack([fr, ar]), { track: ar, translate: 'en' });
  assert.deepEqual(yt.chooseTrack([fr]), { track: fr, translate: null });
  assert.equal(yt.chooseTrack([{ languageCode: 'en-GB', baseUrl: 'e' }]).track.languageCode, 'en-GB');
  assert.equal(yt.chooseTrack([]), null);
});

test('playability → specific reason', () => {
  const c = (status, reason) => yt.classifyPlayability({ status, reason });
  assert.equal(c('OK'), null);
  assert.equal(c('LOGIN_REQUIRED', 'Private video'), 'private');
  assert.equal(c('LOGIN_REQUIRED', "Sign in to confirm you're not a bot"), 'blocked');
  assert.equal(c('LOGIN_REQUIRED', 'Sign in to confirm your age'), 'age_restricted');
  assert.equal(c('UNPLAYABLE', 'The uploader has not made this video available in your country'), 'region_blocked');
  assert.equal(c('ERROR', 'Video unavailable'), 'unavailable');
  assert.equal(c('LIVE_STREAM_OFFLINE', 'This live event will begin in 3 hours.'), 'live');
});

test('word timings survive sentence building; text matches the timed words exactly', () => {
  const lines = toSentences([
    { start: 1.2, dur: 3, text: 'today I want', words: [{ t: 1.2, text: 'today' }, { t: 1.6, text: 'I' }, { t: 1.9, text: 'want' }] },
    { start: 4.2, dur: 2, text: 'data. Next', words: [{ t: 4.2, text: 'data.' }, { t: 5, text: 'Next' }] },
  ]);
  assert.deepEqual(lines[0], { text: 'today I want data.', start: 1.2, words: [[1200, 'today'], [1600, 'I'], [1900, 'want'], [4200, 'data.']] });
  assert.deepEqual(lines[1].words, [[5000, 'Next']]);
  for (const l of lines) assert.equal(l.words.map((w) => w[1]).join(' '), l.text);
  // Without word timings, a sentence that starts inside a segment gets an interpolated time.
  const plain = toSentences([{ start: 10, dur: 4, text: 'One two. Three four' }]);
  assert.deepEqual(plain.map((l) => [l.text, l.start, l.words]), [['One two.', 10, undefined], ['Three four', 12, undefined]]);
  assert.deepEqual(yt.parseTranscriptPanel({ a: [{ transcriptSegmentRenderer: { startMs: '1500', endMs: '4000', snippet: { runs: [{ text: 'Panel line' }] } } }] }),
    [{ start: 1.5, dur: 2.5, text: 'Panel line' }]);
});

/* ------------------------------------------------------- mocked YouTube */

const realFetch = globalThis.fetch;
let routes = {};
let seen = [];
function mock() {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
    const body = opts.body ? JSON.parse(opts.body) : null;
    seen.push({ u, client: body?.context?.client?.clientName });
    for (const [pattern, handler] of Object.entries(routes)) {
      if (u.includes(pattern)) {
        const r = await handler(u, body);
        return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status || 200 });
      }
    }
    return new Response('not mocked', { status: 404 });
  };
}
const player = (status, extra = {}) => ({ playabilityStatus: { status, ...(extra.reason ? { reason: extra.reason } : {}) }, ...extra.data });
const okPlayer = (tracks) => player('OK', { data: { videoDetails: { videoId: 'AAAAAAAAAAA', title: 'Data Talk', author: 'Chan', lengthSeconds: '120' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } } });
const ASR = JSON.stringify({ events: [
  { tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: 'Today' }, { utf8: ' I', tOffsetMs: 500 }, { utf8: ' want', tOffsetMs: 800 }, { utf8: ' data.', tOffsetMs: 1200 }] },
  { tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: 'One' }, { utf8: ' more', tOffsetMs: 300 }, { utf8: ' thing.', tOffsetMs: 600 }] },
] });

beforeEach(() => {
  routes = {};
  seen = [];
  mock();
});
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.YOUTUBE_BUDGET_MS;
});

test('first client works: auto captions with word timings', async () => {
  routes['/youtubei/v1/player'] = () => ({ body: okPlayer([{ languageCode: 'en', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en' }]) });
  routes['/api/timedtext'] = (u) => ({ body: u.includes('fmt=json3') ? ASR : '' });
  const r = await yt.getVideoWithTranscript('AAAAAAAAAAA');
  assert.equal(r.source, 'youtube-auto-captions');
  assert.equal(r.meta.title, 'Data Talk');
  assert.equal(r.segments[0].words.length, 4);
  assert.equal(seen[0].client, 'ANDROID_VR');
});

test('a client refused ("not a bot") → the next client is tried', async () => {
  routes['/youtubei/v1/player'] = (_u, b) => ({
    body: b.context.client.clientName === 'IOS'
      ? okPlayer([{ languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en' }])
      : player('LOGIN_REQUIRED', { reason: "Sign in to confirm you're not a bot" }),
  });
  routes['/api/timedtext'] = () => ({ body: '<transcript><text start="1" dur="2">Human captions here.</text></transcript>' });
  const r = await yt.getVideoWithTranscript('AAAAAAAAAAA');
  assert.equal(r.source, 'youtube-captions');
  assert.deepEqual(seen.filter((s) => s.client).map((s) => s.client), ['ANDROID_VR', 'IOS']);
});

test('all player clients blocked → transcript panel fallback', async () => {
  routes['/youtubei/v1/player'] = () => ({ body: player('LOGIN_REQUIRED', { reason: "Sign in to confirm you're not a bot" }) });
  routes['/youtubei/v1/next'] = () => ({ body: { engagementPanels: [{ x: { getTranscriptEndpoint: { params: 'PARAMS' } } }] } });
  routes['/youtubei/v1/get_transcript'] = (_u, b) => ({ body: b.params === 'PARAMS' ? { actions: [{ transcriptSegmentRenderer: { startMs: '2000', endMs: '5000', snippet: { runs: [{ text: 'From the panel.' }] } } }] } : {} });
  const r = await yt.getVideoWithTranscript('AAAAAAAAAAA');
  assert.equal(r.source, 'youtube-transcript-panel');
  assert.equal(r.segments[0].text, 'From the panel.');
});

test('specific errors: private, removed, age-restricted, no captions, blocked', async () => {
  const expectCode = async (code) => {
    await assert.rejects(yt.getVideoWithTranscript('AAAAAAAAAAA', { budgetMs: 15000 }), (err) => {
      assert.equal(err.code, code);
      assert.equal(err.status, 422);
      assert.ok(/[؀-ۿ]/.test(err.message), 'Arabic message');
      assert.ok(Array.isArray(err.details) && err.details.length);
      return true;
    });
  };
  routes['/youtubei/v1/player'] = () => ({ body: player('LOGIN_REQUIRED', { reason: 'Private video' }) });
  await expectCode('private');
  routes['/youtubei/v1/player'] = () => ({ body: player('ERROR', { reason: 'Video unavailable' }) });
  await expectCode('unavailable');
  routes['/youtubei/v1/player'] = () => ({ body: player('LOGIN_REQUIRED', { reason: 'Sign in to confirm your age' }) });
  await expectCode('age_restricted');
  routes['/youtubei/v1/player'] = () => ({ body: okPlayer([]) });
  await expectCode('no_captions');
  routes = {
    '/youtubei/v1/player': () => ({ body: player('LOGIN_REQUIRED', { reason: "Sign in to confirm you're not a bot" }) }),
    '/oembed': () => ({ body: { title: 'A real video', author_name: 'Chan' } }),
  };
  await expectCode('blocked');
});

/* ------------------------------------------------------------------ API */

let app;
before(async () => {
  app = await startApp({ seed: false });
});
after(async () => {
  await app?.close();
  db.cleanup();
});

test('API: link → video + transcript + timestamps + word timings stored for highlighting', async () => {
  routes['/youtubei/v1/player'] = () => ({ body: okPlayer([{ languageCode: 'en', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en' }]) });
  routes['/api/timedtext'] = () => ({ body: ASR });
  const res = await realFetch(`${app.base}/api/sources/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://youtu.be/AAAAAAAAAAA?si=x' }) });
  const a = await res.json();
  assert.equal(res.status, 200, JSON.stringify(a));
  const v = await (await realFetch(`${app.base}/api/sources/${a.source_id}`)).json();
  assert.equal(v.source.youtube_id, 'AAAAAAAAAAA');
  assert.equal(v.source.transcript_source, 'youtube-auto-captions');
  assert.deepEqual(v.lines.map((l) => [l.text, l.start_seconds]), [['Today I want data.', 1], ['One more thing.', 5]]);
  assert.deepEqual(v.lines[0].words, [[1000, 'Today'], [1500, 'I'], [1800, 'want'], [2200, 'data.']]);
  assert.equal(v.lines[0].duration, 4);
});

test('API: a failure returns the specific reason and the details; pasting still works', async () => {
  routes['/youtubei/v1/player'] = () => ({ body: player('LOGIN_REQUIRED', { reason: 'Private video' }) });
  const res = await realFetch(`${app.base}/api/sources/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB' }) });
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.equal(body.code, 'private');
  assert.match(body.error, /خاص/);
  assert.ok(body.details.length > 0);
  const bad = await realFetch(`${app.base}/api/sources/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://vimeo.com/123' }) });
  assert.equal(bad.status, 400);
  routes['/youtubei/v1/player'] = () => ({ body: okPlayer([]) });
  const pasted = await realFetch(`${app.base}/api/sources/youtube`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB', transcript: '0:03 First pasted line.\n0:09 Second pasted line.' }),
  });
  assert.equal(pasted.status, 200);
  const v = await (await realFetch(`${app.base}/api/sources/${(await pasted.json()).source_id}`)).json();
  assert.deepEqual(v.lines.map((l) => l.start_seconds), [3, 9]);
});

test('transcript service (Supadata): direct answer, long-video job, no transcript', async () => {
  routes['api.supadata.ai/v1/youtube/transcript'] = (u) => (u.includes('LONGLONGLON')
    ? { body: { jobId: 'job-1' } }
    : u.includes('NOTRANSCRIP') ? { status: 404, body: { error: 'transcript-unavailable', message: 'No transcript found' } }
      : { body: { lang: 'en', content: [{ text: 'Hello there.', offset: 1500, duration: 2000 }, { text: 'Second line.', offset: 4000, duration: 1000 }] } });
  routes['api.supadata.ai/v1/transcript/job-1'] = () => ({ body: { status: 'completed', content: [{ text: 'From the job.', offset: 0, duration: 900 }] } });
  const opts = { transcriptProvider: 'supadata', transcriptApiKey: 'test-key' };
  assert.deepEqual(await yt.externalTranscript('AAAAAAAAAAA', opts), [{ start: 1.5, dur: 2, text: 'Hello there.' }, { start: 4, dur: 1, text: 'Second line.' }]);
  assert.equal((await yt.externalTranscript('LONGLONGLON', opts))[0].text, 'From the job.');
  await assert.rejects(yt.externalTranscript('NOTRANSCRIP', opts), (err) => err.noTranscript === true);
  assert.equal(await yt.externalTranscript('AAAAAAAAAAA', {}), null, 'not configured → skipped');
});

test("pasted transcript in YouTube's 'Show transcript' copy format keeps the times", () => {
  const copied = '0:00\nhello everyone and welcome\n\n0:04\nso today we talk about data\n1:02:03\nmuch later on\n';
  const segs = yt.parsePastedTranscript(copied);
  assert.deepEqual(segs.map((s) => [s.start, s.text]), [[0, 'hello everyone and welcome'], [4, 'so today we talk about data'], [3723, 'much later on']]);
  const lines = toSentences(segs);
  assert.deepEqual(lines.map((l) => l.start), [0, 4, 3723]);
});
