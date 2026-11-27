// Turning a YouTube video or a text into a readable source.
//
// Analysis is fast and deterministic (transcript + offline dictionary), so it
// fits any hosting time limit. AI then improves the source in small chunks,
// each its own short request, driven by the reader page:
//   refineSource()    — AI chooses the learnable items, ~25 lines per call
//   translateSource() — Arabic subtitles, ~15 lines per call
// Each chunk is stored as soon as it is done, so nothing is lost or repeated.
import { createHash } from 'node:crypto';
import { run, get, all, tx } from '../db/index.js';
import { config } from '../config.js';
import { recordTranscript } from './ai.js';
import { httpError } from '../lib/errors.js';
import { parseYoutubeId, getVideoWithTranscript, getVideoMeta, parsePastedTranscript, MESSAGES, TranscriptError, externalTranscript, oembed } from '../lib/youtube.js';
import { readArticle } from '../lib/article.js';
import { extractVocabulary, extractChunkWithAi, toSentences, translateWithAi, translateToEnglishWithAi, suspiciousTranslations, alignWithAi, ExtractionError } from './extractor.js';
import { chunkRanges, batchRanges } from '../lib/align.js';
import { aiConfigured, aiAvailable, AiError, OFFLINE_MESSAGE, unavailableMessage } from './ai.js';
import * as sources from '../data/sources.js';

const REFINE_CHUNK = 25;

function toLines(segments) {
  return toSentences(segments).map((s, idx) => ({ idx, start: s.start, text: s.text, words: s.words }));
}

// Reasons that are the same from any network — no point asking again elsewhere.
const FINAL = new Set(['private', 'unavailable', 'live', 'no_captions', 'age_restricted', 'region_blocked']);

/**
 * Transcript from YouTube: first through the edge function (a network YouTube
 * rarely refuses), then directly from this server. origin = this site's URL.
 */
export async function fetchTranscript(videoId, origin) {
  const yt = config.youtube;
  const options = {
    budgetMs: yt.budgetMs, timeoutMs: yt.timeoutMs, transcriptProvider: yt.transcriptProvider, transcriptApiUrl: yt.transcriptApiUrl, transcriptApiKey: yt.transcriptApiKey(),
  };
  const details = [];
  // Everything must fit in one hosting request (about 30 s): the transcript gets ~18 s.
  const deadline = Date.now() + 18000;
  const left = () => deadline - Date.now();
  const jobs = {
    get: async (v) => (await get('SELECT value FROM app_settings WHERE key = ?', `ytjob:${v}`))?.value || null,
    set: (v, j) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `ytjob:${v}`, j),
    clear: (v) => run('DELETE FROM app_settings WHERE key = ?', `ytjob:${v}`),
  };
  // 0) Someone already added this video: reuse its transcript (no service call at all)
  try {
    const src = await get('SELECT id FROM sources WHERE youtube_id = ? AND is_demo = 0 ORDER BY id LIMIT 1', videoId);
    const lines = src ? await all('SELECT start_seconds, text FROM transcript_lines WHERE source_id = ? ORDER BY idx', src.id) : [];
    if (lines.length >= 3) return { meta: await getVideoMeta(videoId), segments: lines.map((l) => ({ start: Number(l.start_seconds) || 0, dur: 0, text: l.text })), source: 'shared', via: 'shared' };
  } catch { /* fetch it as usual */ }
  // 1) A configured transcript service: the most reliable path on hosted servers.
  //    Its monthly limit reached → don't call it again for an hour (every refused call is wasted).
  //    The wait belongs to the key that hit the limit: a new key (e.g. a renewed plan) starts clean.
  const keyId = createHash('sha256').update(String(options.transcriptApiKey || options.transcriptApiUrl || '')).digest('hex').slice(0, 8);
  const [limitAt, limitKey] = String((await get('SELECT value FROM app_settings WHERE key = ?', 'ytsvc:limit'))?.value || '').split(':');
  const limited = limitKey === keyId ? Number(limitAt) || 0 : 0;
  if (Date.now() - limited < 3600000) throw new TranscriptError('service_limit', { details: ['transcript service limit reached (waiting an hour before trying again)'] });
  if (((options.transcriptProvider && options.transcriptApiKey) || options.transcriptApiUrl) && Date.now() - limited > 3600000) {
    try {
      const segments = await externalTranscript(videoId, { ...options, deadline, jobs });
      if (segments?.length) {
        await recordTranscript();
        return { meta: await getVideoMeta(videoId), segments, source: 'transcript-service', via: 'service' };
      }
      details.push('service: empty transcript');
    } catch (err) {
      if (err.pending) throw err; // a long video: the service is still writing its transcript
      if (err.limit) {
        await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', 'ytsvc:limit', `${Date.now()}:${keyId}`);
        throw new TranscriptError('service_limit', { details: [err.message] });
      }
      details.push(err.message.slice(0, 160));
    }
  }
  if (origin && yt.internalKey() && left() > 4000) {
    try {
      const ctrl = AbortSignal.timeout(Math.max(3000, Math.min(left() - 1000, yt.budgetMs)));
      const res = await fetch(`${origin}/internal/youtube-transcript?v=${encodeURIComponent(videoId)}`, { headers: { 'x-lexitube-key': yt.internalKey() }, signal: ctrl });
      const r = res.ok ? await res.json() : { ok: false, code: 'fetch_failed', details: [`HTTP ${res.status}`] };
      if (r.ok && r.segments?.length) return { ...r, via: `edge:${r.via || ''}` };
      details.push(...(r.details || []).map((d) => `edge ${d}`));
      if (FINAL.has(r.code)) throw new TranscriptError(r.code, { meta: r.meta, details });
    } catch (err) {
      if (err instanceof TranscriptError) throw err;
      details.push(`edge: ${err.message}`);
    }
  }
  try {
    const r = await getVideoWithTranscript(videoId, { ...options, skip: ['external'], budgetMs: Math.max(4000, Math.min(left(), options.budgetMs - 20000)) });
    return { ...r, via: `direct:${r.via || ''}` };
  } catch (err) {
    if (err instanceof TranscriptError) err.details = [...details, ...(err.details || []).map((d) => `direct ${d}`)];
    throw err;
  }
}

// 🌐 A video whose words are Arabic: it is kept at once (Arabic on the left), then translated to ENGLISH step by step
// (the reader asks again and again, like the Arabic subtitles of an English video). Each step swaps a few lines:
// the English becomes the line's text (the words to learn) and the Arabic original moves beside it. When all lines are done,
// the useful English words are picked. The marker lives in app_settings (no new table).
const ar2enKey = (id) => `ar2en:${id}`;
export const sourceAr2en = async (id) => !!(await get('SELECT 1 AS x FROM app_settings WHERE key = ?', ar2enKey(id)));
const markAr2en = (id) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', ar2enKey(id), 'pending');

async function finishAr2en(sourceId, userId, src) {
  const rows = await all('SELECT idx, start_seconds AS start, text FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  const lines = rows.map((r) => ({ idx: r.idx, start: r.start, text: r.text }));
  let items = [];
  let rest = [];
  let engine = 'dictionary';
  let wordCount = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  try {
    ({ items, rest = [], engine, word_count: wordCount } = await extractVocabulary({ title: src.title, channel: src.channel, lines }));
  } catch (err) {
    if (!(err instanceof ExtractionError) || err.status !== 422) throw err;
  }
  if (items.length) await sources.addItemsToSource(sourceId, items);
  await sources.linkSavedWords(sourceId, userId);
  await run('UPDATE sources SET word_count = ?, extractor = ? WHERE id = ?', wordCount, engine, sourceId);
  if (rest.length) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `idxrest:${sourceId}`, JSON.stringify(rest));
  await run('DELETE FROM app_settings WHERE key = ?', ar2enKey(sourceId));
  await sources.setTranslationStatus(sourceId, 'done');
}

async function arabicToEnglishStep(sourceId, userId, src) {
  const count = () => sources.translationCounts(sourceId);
  const before = await count();
  const batch = await sources.untranslatedLines(sourceId, 25);
  if (!batch.length) { await finishAr2en(sourceId, userId, src); return { complete: true, total: before.total, done: before.translated, status: 'done', reload: true }; }
  if (!aiAvailable()) return { complete: true, total: before.total, done: before.translated, status: 'unavailable', ai_error: unavailableMessage() };
  let map;
  try {
    map = await translateToEnglishWithAi(batch, src.title);
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    return { complete: true, total: before.total, done: before.translated, status: 'failed', ai_error: err.message };
  }
  const pairs = batch.filter((l) => String(map.get(l.idx) || '').trim()).map((l) => ({ id: l.id, ar: l.text, en: String(map.get(l.idx)).trim() }));
  if (!pairs.length) return { complete: true, total: before.total, done: before.translated, status: 'failed', ai_error: OFFLINE_MESSAGE };
  await tx(async () => {
    for (const p of pairs) await run('UPDATE transcript_lines SET text_ar = text, text = ? WHERE id = ? AND text_ar IS NULL', p.en, p.id);
  });
  const after = await count();
  if (after.translated < after.total) return { complete: false, total: after.total, done: after.translated, status: 'running', lines: pairs };
  await finishAr2en(sourceId, userId, src);
  return { complete: true, total: after.total, done: after.translated, status: 'done', lines: pairs, reload: true };
}

/** Analyse a YouTube video (or its pasted transcript) and store it. */
export async function analyzeYoutube({ url, transcript, force, origin }, userId) {
  const youtubeId = parseYoutubeId(url);
  if (!youtubeId) throw httpError(400, MESSAGES.invalid_url);
  // timings in the hosting log, so a slow step is easy to find (no data, only milliseconds)
  const t0 = Date.now();
  const mark = (step) => console.log(`[add ${youtubeId}] ${step} ${Date.now() - t0}ms`);
  const existing = await sources.findSourceByYoutubeId(youtubeId, userId);
  if (existing && !force && !transcript?.trim() && await sources.lineCount(existing.id)) {
    if (await sourceAr2en(existing.id)) return { source_id: existing.id, cached: true, ar2en: true };
    // a video saved earlier with ARABIC words (before the site could translate it): start its English translation now
    const head = await all('SELECT text FROM transcript_lines WHERE source_id = ? ORDER BY idx LIMIT 40', existing.id);
    if (!isArabicText(head.map((l) => l.text).join(' '))) return { source_id: existing.id, cached: true };
    if (!aiAvailable()) throw httpError(503, ARABIC_VIDEO_NEEDS_AI);
    await run('UPDATE transcript_lines SET text_ar = NULL WHERE source_id = ?', existing.id);
    await markAr2en(existing.id);
    return { source_id: existing.id, cached: true, ar2en: true };
  }
  let meta;
  let segments;
  let transcriptSource;
  if (transcript?.trim()) {
    segments = parsePastedTranscript(transcript);
    transcriptSource = 'pasted';
    try {
      meta = await getVideoMeta(youtubeId);
    } catch {
      meta = { youtube_id: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}`, title: 'YouTube video', thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` };
    }
  } else {
    ({ meta, segments, source: transcriptSource } = await fetchTranscript(youtubeId, origin)); // throws TranscriptError
  }
  const lines = toLines(segments);
  mark(`transcript (${transcriptSource}, ${lines.length} lines)`);
  if (!lines.length) throw httpError(422, 'ما لقينا نصًا في هذا الفيديو.');
  // a video whose words are Arabic: keep it now, then the reader translates it to English step by step
  if (isArabicText(lines.slice(0, 60).map((l) => l.text).join(' '))) {
    if (!aiAvailable()) throw httpError(503, ARABIC_VIDEO_NEEDS_AI);
    const arId = await sources.saveSource({ ...meta, kind: 'youtube', transcript_source: transcriptSource, extractor: 'ar2en', word_count: 0 }, lines, [], userId);
    await markAr2en(arId);
    mark('arabic video saved');
    return { source_id: arId, cached: false, ai: true, ar2en: true };
  }
  let items = [];
  let rest = [];
  let engine = 'dictionary';
  let word_count = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  try {
    ({ items, rest = [], engine, word_count } = await extractVocabulary({ title: meta.title, channel: meta.channel, lines }));
  } catch (err) {
    if (!(err instanceof ExtractionError) || err.status !== 422) throw err; // very short video: keep it readable anyway
  }
  mark(`words (${items.length})`);
  const sourceId = await sources.saveSource({ ...meta, kind: 'youtube', transcript_source: transcriptSource, extractor: engine, word_count }, lines, items, userId);
  mark('saved');
  if (rest.length) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `idxrest:${sourceId}`, JSON.stringify(rest));
  // auto-add the channel to المفضلة (custom channels) if it is new
  if (meta.channel) {
    try {
      const chKey = `channels:${userId}`;
      const row = await get('SELECT value FROM app_settings WHERE key = ?', chKey);
      const prefs = row ? JSON.parse(row.value) : { pinned: [], hidden: [], custom: [], known: {} };
      prefs.custom ??= []; prefs.pinned ??= []; prefs.hidden ??= []; prefs.known ??= {};
      const handle = meta.channel_handle || '';
      const id = handle ? `@${handle.toLowerCase()}` : `n:${meta.channel.toLowerCase()}`;
      const already = prefs.custom.some((c) => (c.handle ? `@${c.handle.toLowerCase()}` : `n:${c.name.toLowerCase()}`) === id);
      if (!already) {
        const oe = handle ? null : await oembed(youtubeId).catch(() => null);
        const h = handle || (oe?.author_url?.match(/youtube\.com\/@([A-Za-z0-9._-]+)/) || [])[1] || '';
        prefs.custom.push({ name: meta.channel, handle: h, url: h ? '' : (oe?.author_url || ''), field: '' });
        await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', chKey, JSON.stringify(prefs));
      }
    } catch { /* don't block the video over a favorites error */ }
  }
  return { source_id: sourceId, cached: false, ai: aiAvailable() };
}

/** Is this text mostly Arabic? (letters, so numbers and punctuation do not decide) */
export function isArabicText(text) {
  const s = String(text || '');
  const ar = (s.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return ar >= 12 && ar > en * 1.5;
}
const ARABIC_VIDEO_NEEDS_AI = 'هذا الفيديو نصه بالعربي، وترجمته للإنجليزي تحتاج الذكاء الاصطناعي وهو غير متاح الحين. جرّب لاحقًا.';
const AR_MAX_CHARS = 6000; // an Arabic text is translated before it is saved, inside one request

/** Arabic lines → English lines that keep the Arabic beside them (the site teaches English). */
async function arabicToEnglishLines(lines, title) {
  if (!aiAvailable()) throw httpError(503, 'ترجمة النص العربي للإنجليزي تحتاج الذكاء الاصطناعي، وهو غير متاح الحين. جرّب لاحقًا.');
  const chunks = [];
  for (let i = 0; i < lines.length; i += 25) chunks.push(lines.slice(i, i + 25));
  let maps;
  try {
    maps = await Promise.all(chunks.map((c) => translateToEnglishWithAi(c, title)));
  } catch (err) {
    if (err instanceof AiError) throw httpError(err.status || 503, err.message);
    throw err;
  }
  const en = new Map(maps.flatMap((m) => [...m]));
  return lines.map((l) => ({ idx: l.idx, start: null, text: String(en.get(l.idx) || '').trim() || l.text, text_ar: l.text }));
}

/** Turn pasted text into a readable source with suggested words. An Arabic text is translated to English first (the Arabic stays beside it). */
export async function analyzeText(text, userId, title, url = null) {
  const clean = String(text || '').trim();
  const arabic = isArabicText(clean);
  if (arabic && clean.length > AR_MAX_CHARS) throw httpError(413, `النص العربي طويل — الصق حتى ${AR_MAX_CHARS} حرف في المرة وبنترجمه للإنجليزي.`);
  const sentences = clean.split(arabic ? /(?<=[.!?؟])\s+|\n+/ : /(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  let lines = sentences.map((s, idx) => ({ idx, start: null, text: s }));
  if (arabic) lines = await arabicToEnglishLines(lines, title || '');
  const words = (arabic ? lines.map((l) => l.text).join(' ') : clean).split(/\s+/);
  const firstWords = words.slice(0, 7).join(' ');
  let items = [];
  let rest = [];
  let engine = 'dictionary';
  let wordCount = words.length;
  try {
    ({ items, rest = [], engine, word_count: wordCount } = await extractVocabulary({ title: title || firstWords, lines }));
  } catch (err) {
    if (!(err instanceof ExtractionError) || err.status !== 422) throw err; // very short text: keep it readable anyway
  }
  const sourceId = await sources.saveSource(
    { kind: 'text', title: title || `${firstWords}${words.length > 7 ? '…' : ''}`, url, transcript_source: 'text', extractor: engine, word_count: wordCount },
    lines, items, userId,
  );
  if (rest.length) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', `idxrest:${sourceId}`, JSON.stringify(rest));
  return { source_id: sourceId, ai: aiAvailable() };
}

/** 📰 An article address: read the page, keep it as a text, mark every dictionary word right away (no AI for that step). */
export async function analyzeArticle(address, userId, { fetcher } = {}) {
  const { title, text, url } = await readArticle(address, { fetcher });
  const r = await analyzeText(text, userId, title, url);
  await sources.addDictionaryWords(r.source_id).catch(() => {}); // the reader and «نصوص» finish the rest (simplest forms) step by step
  return { ...r, title };
}

/** ⚡ One short step: add up to 30 more words from the site index to an opened video. */
export async function indexStep(sourceId, userId) {
  await requireSource(sourceId, userId);
  const key = `idxrest:${sourceId}`;
  const row = await get('SELECT value FROM app_settings WHERE key = ?', key);
  if (!row) return { added: 0, more: false };
  let rest = [];
  try { rest = JSON.parse(row.value); } catch { rest = []; }
  const now = rest.slice(0, 30);
  const later = rest.slice(30);
  const added = now.length ? await sources.addItemsToSource(sourceId, now) : 0;
  if (later.length) await run('UPDATE app_settings SET value = ? WHERE key = ?', JSON.stringify(later), key);
  else await run('DELETE FROM app_settings WHERE key = ?', key);
  return { added, more: later.length > 0 };
}

async function requireSource(id, userId) {
  const src = await sources.getSource(id, userId);
  if (!src) throw httpError(404, 'ما لقينا هذا المقطع.');
  return src;
}

/**
 * One step of AI word selection. Returns progress; call again until done.
 * {done, cursor, total, added, ai_error}
 */
export async function refineSource(sourceId, userId) {
  const src = await requireSource(sourceId, userId);
  const total = await sources.lineCount(sourceId);
  if (src.is_demo || src.ai_cursor >= total) return { done: true, cursor: total, total, added: 0 };
  if (!aiAvailable()) return { done: true, cursor: src.ai_cursor, total, added: 0, ai_error: unavailableMessage() };
  const lines = await sources.linesFrom(sourceId, src.ai_cursor, REFINE_CHUNK);
  if (!lines.length) {
    await sources.setAiCursor(sourceId, total, 'ai');
    return { done: true, cursor: total, total, added: 0 };
  }
  let items;
  try {
    items = await extractChunkWithAi({ title: src.title, lines });
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    return { done: true, cursor: src.ai_cursor, total, added: 0, ai_error: err.message };
  }
  // AI choices come before dictionary matches; most useful first.
  for (const it of items) it.rank = -it.usefulness;
  const added = await sources.addItemsToSource(sourceId, items);
  // new words: the next simplifying pass picks them up (it continues after the last one done)
  if (added) await run('DELETE FROM app_settings WHERE key = ?', `simplest:${sourceId}`);
  const cursor = lines[lines.length - 1].idx + 1;
  const done = cursor >= total;
  await sources.setAiCursor(sourceId, done ? total : cursor, done ? 'ai' : null);
  return { done, cursor, total, added };
}

/** One step of subtitle translation. {complete, total, done, status, ai_error, lines} */
export async function translateSource(sourceId, userId) {
  const src = await requireSource(sourceId, userId);
  if (await sourceAr2en(sourceId)) return arabicToEnglishStep(sourceId, userId, src);
  const progress = async () => {
    const c = await sources.translationCounts(sourceId);
    return { total: c.total, done: c.translated };
  };
  const before = await progress();
  if (before.done >= before.total) {
    if (src.translation_status !== 'done') await sources.setTranslationStatus(sourceId, 'done');
    return { complete: true, ...before, status: 'done' };
  }
  if (!aiConfigured()) {
    await sources.setTranslationStatus(sourceId, 'unavailable');
    return { complete: true, ...before, status: 'unavailable', ai_error: OFFLINE_MESSAGE };
  }
  if (!aiAvailable()) return { complete: true, ...before, status: src.translation_status, ai_error: unavailableMessage() };
  const batch = await sources.untranslatedLines(sourceId, config.ai.translateBatch);
  let map;
  try {
    map = await translateWithAi(batch, src.title);
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    await sources.setTranslationStatus(sourceId, 'failed');
    return { complete: true, ...before, status: 'failed', ai_error: err.message };
  }
  const pairs = batch.filter((l) => map.get(l.idx)).map((l) => ({ id: l.id, ar: map.get(l.idx) }));
  if (!pairs.length) {
    await sources.setTranslationStatus(sourceId, 'failed');
    return { complete: true, ...before, status: 'failed', ai_error: OFFLINE_MESSAGE };
  }
  await sources.storeLineTranslations(pairs);
  const after = await progress();
  const complete = after.done >= after.total;
  await sources.setTranslationStatus(sourceId, complete ? 'done' : 'running');
  return { complete, ...after, status: complete ? 'done' : 'running', lines: pairs };
}

/**
 * Videos translated before: find windows where the Arabic slipped to the wrong lines
 * and translate those windows again (a few seconds per call; the reader calls again
 * while "more" is true). Fixed lines lose their old phrase pairing so it is redone.
 */
export async function repairTranslation(sourceId, userId, { budgetMs = 15000 } = {}) {
  const src = await requireSource(sourceId, userId);
  // v2: every window of a video is translated again once, strictly line by line (old videos
  // could carry words from the next line); kept only when it is not worse than before.
  const key = `tr-fix2:${sourceId}`;
  const state = (await get('SELECT value FROM app_settings WHERE key = ?', key))?.value || '0';
  if (state === 'done' || src.is_demo) return { more: false, fixed: 0 };
  if (!aiAvailable()) return { more: false, fixed: 0, ai_error: unavailableMessage() };
  const started = Date.now();
  let cursor = Number(state) || 0;
  let fixed = 0;
  const W = 20;
  while (Date.now() - started < budgetMs) {
    const win = await all('SELECT id, idx, text, text_ar FROM transcript_lines WHERE source_id = ? AND idx >= ? ORDER BY idx LIMIT ?', sourceId, cursor, W);
    if (!win.length) {
      await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, 'done');
      return { more: false, fixed };
    }
    const have = new Map(win.map((l) => [l.idx, l.text_ar]));
    const badNow = win.every((l) => l.text_ar) ? suspiciousTranslations(win, have).size : 0;
    if (win.every((l) => l.text_ar)) {
      const map = await translateWithAi(win, src.title, { strict: true });
      if (suspiciousTranslations(win, map).size <= badNow) {
        await tx(async () => {
          for (const l of win) {
            const ar = map.get(l.idx);
            if (ar && ar !== l.text_ar) { await run('UPDATE transcript_lines SET text_ar = ?, align_json = NULL WHERE id = ?', ar, l.id); fixed += 1; }
          }
        });
      }
    }
    cursor = win.at(-1).idx + 1;
    await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, String(cursor));
  }
  return { more: true, fixed };
}

/** «ترجمة أدق»: the video is translated again (new, more accurate rules), once, when the learner asks. */
export async function retranslate(sourceId, userId) {
  await requireSource(sourceId, userId);
  await run('DELETE FROM app_settings WHERE key = ?', `tr-fix2:${sourceId}`);
  return { ok: true };
}

export async function translationStatus(sourceId, userId) {
  const src = await requireSource(sourceId, userId);
  const c = await sources.translationCounts(sourceId);
  let { translation_status: status } = src;
  if (c.total && c.translated >= c.total) status = 'done';
  else if (!aiConfigured() && status !== 'done') status = 'unavailable';
  return { status, total: c.total, done: c.translated, ai: aiAvailable() };
}

/**
 * Align the next few lines phrase by phrase (English ↔ Arabic), starting near
 * where the learner is. Lines the AI can't split exactly are marked as done
 * with an empty alignment, so they keep the normal layout and aren't retried.
 */
export async function alignSource(sourceId, userId, fromIdx = 0, skip = 0) {
  const src = await requireSource(sourceId, userId);
  const batch = await sources.unalignedLines(sourceId, Math.max(0, Number(fromIdx) || 0), 12, Math.max(0, Math.min(120, Number(skip) || 0)));
  if (!batch.length) return { complete: true, lines: [] };
  if (!aiAvailable()) return { complete: true, lines: [], ai_error: unavailableMessage() };
  let map;
  try {
    map = await alignWithAi(batch.map((l) => ({ ...l, text: withPauses(l) })), src.title);
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    return { complete: true, lines: [], ai_error: err.message };
  }
  // Line by line first; when the AI moved words between lines (a sentence running
  // over two lines) or renumbered them, the whole batch is laid over the words in order.
  const inOrder = [...map.values()];
  const whole = batchRanges(batch, inOrder);
  const answered = map.size > 0;
  const rows = [];
  for (const [k, l] of batch.entries()) {
    const own = map.get(l.idx) ? chunkRanges(l.text, map.get(l.idx)) : null;
    const align = own || whole[k] || (map.size === batch.length ? chunkRanges(l.text, inOrder[k]) : null);
    if (!align && !answered) continue; // not answered: tried again next time
    rows.push({ id: l.id, align: align || 'y', ar: align ? align.map((c) => c[2]).filter(Boolean).join(' ') : null });
  }
  await sources.storeAlignments(rows);
  const c = await sources.alignCounts(sourceId);
  return { complete: c.aligned >= c.total, lines: rows.map((r) => ({ id: r.id, align: Array.isArray(r.align) ? r.align : null, ar: r.ar })) };
}

/** The line with "‖" where the speaker pauses (from word timings), so phrases break there. */
function withPauses(line) {
  const w = line.words;
  if (!w || w.length < 3) return line.text;
  const words = line.text.split(/(\s+)/);
  const ms = w.map(([t]) => Number(t));
  let k = -1;
  return words.map((part) => {
    if (!/\S/.test(part)) return part;
    k += 1;
    const gap = k + 1 < ms.length ? ms[k + 1] - ms[k] : 0;
    return gap > 450 && k > 0 ? `${part} ‖` : part;
  }).join('');
}
