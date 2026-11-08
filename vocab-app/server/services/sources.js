// Turning a YouTube video or a text into a readable source.
//
// Analysis is fast and deterministic (transcript + offline dictionary), so it
// fits any hosting time limit. AI then improves the source in small chunks,
// each its own short request, driven by the reader page:
//   refineSource()    — AI chooses the learnable items, ~25 lines per call
//   translateSource() — Arabic subtitles, ~15 lines per call
// Each chunk is stored as soon as it is done, so nothing is lost or repeated.
import { run, get, all, tx } from '../db/index.js';
import { config } from '../config.js';
import { recordTranscript } from './ai.js';
import { httpError } from '../lib/errors.js';
import { parseYoutubeId, getVideoWithTranscript, getVideoMeta, parsePastedTranscript, MESSAGES, TranscriptError, externalTranscript } from '../lib/youtube.js';
import { extractVocabulary, extractChunkWithAi, toSentences, translateWithAi, suspiciousTranslations, alignWithAi, ExtractionError } from './extractor.js';
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
  // 1) A configured transcript service: the most reliable path on hosted servers.
  if ((options.transcriptProvider && options.transcriptApiKey) || options.transcriptApiUrl) {
    try {
      const segments = await externalTranscript(videoId, { ...options, deadline, jobs });
      if (segments?.length) {
        await recordTranscript();
        return { meta: await getVideoMeta(videoId), segments, source: 'transcript-service', via: 'service' };
      }
      details.push('service: empty transcript');
    } catch (err) {
      if (err.pending) throw err; // a long video: the service is still writing its transcript
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

/** Analyse a YouTube video (or its pasted transcript) and store it. */
export async function analyzeYoutube({ url, transcript, force, origin }, userId) {
  const youtubeId = parseYoutubeId(url);
  if (!youtubeId) throw httpError(400, MESSAGES.invalid_url);
  const existing = await sources.findSourceByYoutubeId(youtubeId, userId);
  if (existing && !force && !transcript?.trim() && await sources.lineCount(existing.id)) return { source_id: existing.id, cached: true };
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
  if (!lines.length) throw httpError(422, 'لم نجد نصًا في هذا الفيديو.');
  let items = [];
  let engine = 'dictionary';
  let word_count = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  try {
    ({ items, engine, word_count } = await extractVocabulary({ title: meta.title, channel: meta.channel, lines }));
  } catch (err) {
    if (!(err instanceof ExtractionError) || err.status !== 422) throw err; // very short video: keep it readable anyway
  }
  const sourceId = await sources.saveSource({ ...meta, kind: 'youtube', transcript_source: transcriptSource, extractor: engine, word_count }, lines, items, userId);
  return { source_id: sourceId, cached: false, ai: aiAvailable() };
}

/** Turn pasted English text into a readable source with suggested words. */
export async function analyzeText(text, userId, title) {
  const clean = String(text || '').trim();
  const sentences = clean.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const lines = sentences.map((s, idx) => ({ idx, start: null, text: s }));
  const words = clean.split(/\s+/);
  const firstWords = words.slice(0, 7).join(' ');
  let items = [];
  let engine = 'dictionary';
  let wordCount = words.length;
  try {
    ({ items, engine, word_count: wordCount } = await extractVocabulary({ title: title || firstWords, lines }));
  } catch (err) {
    if (!(err instanceof ExtractionError) || err.status !== 422) throw err; // very short text: keep it readable anyway
  }
  const sourceId = await sources.saveSource(
    { kind: 'text', title: title || `${firstWords}${words.length > 7 ? '…' : ''}`, transcript_source: 'text', extractor: engine, word_count: wordCount },
    lines, items, userId,
  );
  return { source_id: sourceId, ai: aiAvailable() };
}

async function requireSource(id, userId) {
  const src = await sources.getSource(id, userId);
  if (!src) throw httpError(404, 'لم نجد هذا المصدر.');
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
