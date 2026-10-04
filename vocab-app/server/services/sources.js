// Turning a YouTube video or a text into a readable source.
//
// Analysis is fast and deterministic (transcript + offline dictionary), so it
// fits any hosting time limit. AI then improves the source in small chunks,
// each its own short request, driven by the reader page:
//   refineSource()    — AI chooses the learnable items, ~25 lines per call
//   translateSource() — Arabic subtitles, ~15 lines per call
// Each chunk is stored as soon as it is done, so nothing is lost or repeated.
import { config } from '../config.js';
import { httpError } from '../lib/errors.js';
import { parseYoutubeId, getVideoWithTranscript, getVideoMeta, parsePastedTranscript, MESSAGES } from '../lib/youtube.js';
import { extractVocabulary, extractChunkWithAi, toSentences, translateWithAi, ExtractionError } from './extractor.js';
import { aiConfigured, aiAvailable, AiError, OFFLINE_MESSAGE } from './ai.js';
import * as sources from '../data/sources.js';

const REFINE_CHUNK = 25;

function toLines(segments) {
  return toSentences(segments).map((s, idx) => ({ idx, start: s.start, text: s.text, words: s.words }));
}

/** Analyse a YouTube video (or its pasted transcript) and store it. */
export async function analyzeYoutube({ url, transcript, force }, userId) {
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
    ({ meta, segments, source: transcriptSource } = await getVideoWithTranscript(youtubeId)); // throws TranscriptError
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
  if (!aiAvailable()) return { done: true, cursor: src.ai_cursor, total, added: 0, ai_error: OFFLINE_MESSAGE };
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
  if (!aiAvailable()) return { complete: true, ...before, status: src.translation_status, ai_error: OFFLINE_MESSAGE };
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

export async function translationStatus(sourceId, userId) {
  const src = await requireSource(sourceId, userId);
  const c = await sources.translationCounts(sourceId);
  let { translation_status: status } = src;
  if (c.total && c.translated >= c.total) status = 'done';
  else if (!aiConfigured() && status !== 'done') status = 'unavailable';
  return { status, total: c.total, done: c.translated, ai: aiAvailable() };
}
