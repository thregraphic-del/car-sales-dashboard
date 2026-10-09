// Sources (YouTube videos and texts): full transcripts, where each item
// occurs, and the reader view. Re-analysing keeps the learner's saved words.
//
// Every source belongs to one learner (sources.user_id); transcript lines and
// contexts belong to that learner through their source. Functions that take
// an id coming from a request also take the userId and only find the
// learner's own rows — another learner's id behaves exactly like a missing one.
import { all, get, run, insert, tx } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { findSpan } from '../lib/matcher.js';
import { upsertVocabulary, examplesFor, vocabularyPublic } from './vocabulary.js';

const floorOrNull = (n) => (n !== null && n !== undefined ? Math.floor(n) : null);

export async function getSource(id, userId) {
  return (await get('SELECT * FROM sources WHERE id = ? AND user_id = ?', id, userId)) || null;
}

export async function findSourceByYoutubeId(youtubeId, userId) {
  return (await get('SELECT * FROM sources WHERE youtube_id = ? AND user_id = ?', youtubeId, userId)) || null;
}

export async function listSources(userId, limit = 50) {
  return all(
    `SELECT s.*,
       (SELECT COUNT(*) FROM occurrences o WHERE o.source_id = s.id AND o.suggested = 1) AS item_count,
       (SELECT COUNT(*) FROM user_vocabulary uv WHERE uv.source_id = s.id AND uv.user_id = ? AND uv.state = 'saved') AS saved_count,
       (SELECT COUNT(*) FROM transcript_lines l WHERE l.source_id = s.id) AS line_count
     FROM sources s WHERE s.user_id = ? ORDER BY s.analyzed_at DESC, s.id DESC LIMIT ?`,
    userId, userId, limit,
  );
}

const parseWords = (json) => {
  if (!json) return null;
  try {
    const w = JSON.parse(json);
    return Array.isArray(w) && w.length ? w : null;
  } catch {
    return null;
  }
};

/** Lines of a source (already checked to be the learner's). words = [[offset_ms, text], ...] or null. */
export async function sourceLines(sourceId) {
  const rows = await all('SELECT id, idx, start_seconds, duration, text, text_ar, words_json FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  return rows.map(({ words_json: w, ...l }) => ({ ...l, words: parseWords(w) }));
}

/** A transcript line of one of the learner's sources. */
export async function getLine(lineId, userId) {
  return (await get(
    'SELECT l.* FROM transcript_lines l JOIN sources s ON s.id = l.source_id WHERE l.id = ? AND s.user_id = ?',
    lineId, userId,
  )) || null;
}

export async function lineCount(sourceId) {
  return (await get('SELECT COUNT(*) AS n FROM transcript_lines WHERE source_id = ?', sourceId)).n;
}

/** Up to `limit` lines starting at line index `fromIdx` (AI chunks). */
export async function linesFrom(sourceId, fromIdx, limit) {
  const rows = await all(
    'SELECT id, idx, start_seconds, text, text_ar FROM transcript_lines WHERE source_id = ? AND idx >= ? ORDER BY idx LIMIT ?',
    sourceId, fromIdx, limit,
  );
  return rows.map((l) => ({ ...l, start: l.start_seconds }));
}

/** Remember how far AI word selection got; extractor is set when it finishes. */
export async function setAiCursor(sourceId, cursor, extractor = null) {
  if (extractor) await run('UPDATE sources SET ai_cursor = ?, extractor = ? WHERE id = ?', cursor, extractor, sourceId);
  else await run('UPDATE sources SET ai_cursor = ? WHERE id = ?', cursor, sourceId);
}

export async function translationCounts(sourceId) {
  const r = await get('SELECT COUNT(*) AS total, COUNT(text_ar) AS translated FROM transcript_lines WHERE source_id = ?', sourceId);
  return { total: r.total, translated: r.translated };
}

export async function setTranslationStatus(sourceId, status) {
  await run('UPDATE sources SET translation_status = ? WHERE id = ?', status, sourceId);
}

export async function untranslatedLines(sourceId, limit) {
  return all('SELECT id, idx, text FROM transcript_lines WHERE source_id = ? AND text_ar IS NULL ORDER BY idx LIMIT ?', sourceId, limit);
}

/** pairs: [{id, ar}] — never overwrites an existing translation. */
export async function storeLineTranslations(pairs) {
  await tx(async () => {
    for (const p of pairs) await run('UPDATE transcript_lines SET text_ar = ? WHERE id = ? AND text_ar IS NULL', p.ar, p.id);
  });
}

async function addOccurrence(sourceId, vocabId, line, span, extra = {}) {
  if (!line) return null;
  const existing = await get('SELECT id FROM occurrences WHERE source_id = ? AND vocabulary_id = ? AND line_id = ?', sourceId, vocabId, line.id);
  if (existing) {
    if (extra.suggested) {
      await run(
        `UPDATE occurrences SET suggested = 1, rank = ?, contextual_meaning = COALESCE(contextual_meaning, ?), sentence_ar = COALESCE(sentence_ar, ?) WHERE id = ?`,
        extra.rank ?? 0, extra.contextual_meaning || null, extra.sentence_ar || null, existing.id,
      );
    }
    return existing.id;
  }
  return insert(
    `INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, sentence_ar, contextual_meaning, timestamp_seconds, suggested, rank)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    vocabId, sourceId, line.id, span?.start ?? null, span?.end ?? null, line.text, extra.sentence_ar || line.text_ar || null,
    extra.contextual_meaning || null, floorOrNull(line.start), extra.suggested ? 1 : 0, extra.rank ?? 0,
  );
}

/**
 * Store suggested items for a source. items[].line refers to a line idx;
 * every other line where an item appears becomes an extra context.
 * rank: items[].rank if given, else the position in the list (+ rankBase).
 * @returns {Promise<number>} how many items were newly suggested
 */
async function storeItems(sourceId, lineList, items, rankBase = 0) {
  const byIdx = new Map(lineList.map((l) => [l.idx, l]));
  let added = 0;
  for (const [i, item] of items.entries()) {
    const { id: vocabId } = await upsertVocabulary(item);
    const line = byIdx.get(item.line);
    if (line && item.context_arabic && !line.text_ar) {
      await run('UPDATE transcript_lines SET text_ar = ? WHERE id = ? AND text_ar IS NULL', item.context_arabic, line.id);
      line.text_ar = item.context_arabic;
    }
    const opts = { pos: item.part_of_speech, type: item.item_type };
    const already = line ? await get('SELECT 1 AS x FROM occurrences WHERE source_id = ? AND vocabulary_id = ? AND suggested = 1', sourceId, vocabId) : null;
    const span = line ? findSpan(item.term, line.text, opts) : null;
    await addOccurrence(sourceId, vocabId, line, span, {
      suggested: true, rank: item.rank ?? rankBase + i, contextual_meaning: item.contextual_meaning, sentence_ar: item.context_arabic,
    });
    if (line && !already) added += 1;
    let extra = 0;
    for (const l of lineList) {
      if (l === line || extra >= 20) continue;
      const sp = findSpan(item.term, l.text, opts);
      if (sp) {
        await addOccurrence(sourceId, vocabId, l, sp);
        extra += 1;
      }
    }
  }
  return added;
}

/**
 * Store a source with its full transcript (lines) and the extracted items.
 * Re-analysing replaces lines/occurrences but keeps the learner's saved
 * words and re-links them to the new lines.
 */
export async function saveSource(meta, lines, items, userId) {
  return tx(async () => {
    let source = meta.youtube_id ? await findSourceByYoutubeId(meta.youtube_id, userId) : null;
    const keepAr = new Map();
    const now = new Date().toISOString();
    if (source) {
      await run(
        `UPDATE sources SET url = ?, title = ?, channel = ?, duration_seconds = ?, thumbnail_url = ?, transcript_source = ?, extractor = ?, word_count = ?,
           translation_status = 'none', ai_cursor = 0, analyzed_at = ? WHERE id = ?`,
        meta.url || null, meta.title, meta.channel || null, meta.duration_seconds ?? null, meta.thumbnail_url || null, meta.transcript_source || null,
        meta.extractor || null, meta.word_count ?? null, now, source.id,
      );
      // Keep this source's own translations for sentences that stay the same.
      for (const r of await all('SELECT text, text_ar FROM transcript_lines WHERE source_id = ? AND text_ar IS NOT NULL', source.id)) keepAr.set(r.text.trim(), r.text_ar);
      await run('DELETE FROM transcript_lines WHERE source_id = ?', source.id); // cascades to line occurrences
      await run('DELETE FROM occurrences WHERE source_id = ?', source.id);
    } else {
      const id = await insert(
        `INSERT INTO sources (user_id, kind, youtube_id, url, title, channel, duration_seconds, thumbnail_url, transcript_source, extractor, word_count, is_demo, created_at, analyzed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        userId, meta.kind || 'youtube', meta.youtube_id || null, meta.url || null, meta.title, meta.channel || null, meta.duration_seconds ?? null,
        meta.thumbnail_url || null, meta.transcript_source || null, meta.extractor || null, meta.word_count ?? null, meta.is_demo ? 1 : 0, now, now,
      );
      source = await getSource(id, userId);
    }
    // Arabic subtitles already made for this video (by anyone — they hold no personal
    // data) are reused for identical sentences, so a video is never translated twice.
    const known = new Map();
    if (meta.youtube_id) {
      const rows = await all(
        `SELECT l.text, l.text_ar FROM transcript_lines l JOIN sources s ON s.id = l.source_id
         WHERE s.youtube_id = ? AND l.text_ar IS NOT NULL AND s.id <> ?`, meta.youtube_id, source.id,
      );
      for (const r of rows) known.set(r.text.trim(), r.text_ar);
    }
    for (const [k, v] of keepAr) known.set(k, v);
    const lineList = [];
    for (let [i, l] of lines.entries()) { // eslint-disable-line prefer-const
      if (!l.text_ar && known.has(l.text.trim())) l = { ...l, text_ar: known.get(l.text.trim()) };
      const next = lines[i + 1];
      const dur = l.start !== null && l.start !== undefined && next?.start != null ? Math.max(0, next.start - l.start) : null;
      const id = await insert(
        'INSERT INTO transcript_lines (source_id, idx, start_seconds, duration, text, text_ar, words_json) VALUES (?,?,?,?,?,?,?)',
        source.id, l.idx, l.start ?? null, l.duration ?? dur, l.text, l.text_ar || null, l.words?.length ? JSON.stringify(l.words) : null,
      );
      lineList.push({ id, ...l, start: l.start ?? null, text_ar: l.text_ar || null });
    }
    await storeItems(source.id, lineList, items);
    await linkSavedWords(source.id, userId);
    return source.id;
  });
}

/** Add AI-chosen items to an existing source (one chunk). Returns how many are new. */
export async function addItemsToSource(sourceId, items) {
  return tx(async () => {
    const rows = await all('SELECT id, idx, start_seconds, text, text_ar FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
    const lineList = rows.map((l) => ({ ...l, start: l.start_seconds }));
    return storeItems(sourceId, lineList, items);
  });
}

/**
 * Mark the learner's saved words wherever they appear in a source, so they
 * are highlighted and gain this sentence as an extra context.
 */
export async function linkSavedWords(sourceId, userId) {
  const lines = await all('SELECT id, start_seconds AS start, text, text_ar FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  const saved = await all(
    `SELECT uv.id AS uv_id, uv.occurrence_id, v.id AS vocabulary_id, v.term, v.part_of_speech, v.item_type
     FROM user_vocabulary uv JOIN vocabulary v ON v.id = uv.vocabulary_id WHERE uv.user_id = ? AND uv.state = 'saved'`,
    userId,
  );
  for (const w of saved) {
    let count = 0;
    for (const l of lines) {
      if (count >= 10) break;
      const sp = findSpan(w.term, l.text, { pos: w.part_of_speech, type: w.item_type });
      if (!sp) continue;
      count += 1;
      const occId = await addOccurrence(sourceId, w.vocabulary_id, l, sp);
      if (!w.occurrence_id) {
        await run('UPDATE user_vocabulary SET occurrence_id = ?, source_id = COALESCE(source_id, ?) WHERE id = ?', occId, sourceId, w.uv_id);
        w.occurrence_id = occId;
      }
    }
  }
}

export function sourceRef(s) {
  if (!s) return null;
  return { id: s.id, kind: s.kind, youtube_id: s.youtube_id, title: s.title, channel: s.channel, is_demo: !!s.is_demo, thumbnail_url: s.thumbnail_url };
}

/** Everything the reader needs: lines, word marks and the suggested list. */
export async function sourceView(sourceId, userId) {
  const source = await getSource(sourceId, userId);
  if (!source) throw httpError(404, 'لم نجد هذا المصدر.');
  const lines = await sourceLines(sourceId);
  const occ = await all(
    `SELECT o.*, v.term, v.item_type, v.part_of_speech, v.level, v.band, v.pronunciation, v.arabic AS arabic_general, v.simple_english,
       v.similar_json, v.topic, uv.id AS uv_id, uv.state AS user_state, uv.user_arabic
     FROM occurrences o JOIN vocabulary v ON v.id = o.vocabulary_id
     LEFT JOIN user_vocabulary uv ON uv.vocabulary_id = v.id AND uv.user_id = ?
     WHERE o.source_id = ? ORDER BY o.rank, o.id`,
    userId, sourceId,
  );
  const marks = occ
    .filter((o) => o.char_start !== null && (o.suggested || o.user_state === 'saved'))
    .map((o) => ({ line_id: o.line_id, start: o.char_start, end: o.char_end, vocabulary_id: o.vocabulary_id, occurrence_id: o.id, state: o.user_state || null }));
  const seen = new Set();
  const ex = await examplesFor([...new Set(occ.map((o) => o.vocabulary_id))], userId);
  const ref = sourceRef(source);
  const items = occ
    .filter((o) => o.suggested && !seen.has(o.vocabulary_id) && seen.add(o.vocabulary_id))
    .map((o) => ({
      ...vocabularyPublic({ ...o, id: o.vocabulary_id, arabic: o.arabic_general }),
      occurrence_id: o.id,
      line_id: o.line_id,
      uv_id: o.uv_id,
      user_state: o.user_state || null,
      arabic: o.user_arabic || o.contextual_meaning || o.arabic_general,
      context_sentence: o.sentence,
      context_arabic: o.sentence_ar,
      timestamp_seconds: o.timestamp_seconds,
      examples: ex.get(o.vocabulary_id) || [],
      source: ref,
    }));
  return { source, lines, marks, items };
}

export async function deleteSource(id, userId) {
  const r = await run('DELETE FROM sources WHERE id = ? AND user_id = ?', id, userId);
  if (!r.changes) throw httpError(404, 'لم نجد هذا المصدر.');
}

/** Get or create the occurrence of a vocabulary item on a line of the learner's source. */
export async function occurrenceFor(vocabularyId, lineId, userId, { contextual_meaning, sentence_ar, context_note } = {}) {
  const line = await getLine(lineId, userId);
  if (!line) return null;
  const ex = await get('SELECT * FROM occurrences WHERE source_id = ? AND vocabulary_id = ? AND line_id = ?', line.source_id, vocabularyId, line.id);
  if (sentence_ar && !line.text_ar) await run('UPDATE transcript_lines SET text_ar = ? WHERE id = ? AND text_ar IS NULL', sentence_ar, line.id);
  if (ex) {
    if ((contextual_meaning && !ex.contextual_meaning) || (sentence_ar && !ex.sentence_ar) || (context_note && !ex.context_note)) {
      await run(
        'UPDATE occurrences SET contextual_meaning = COALESCE(contextual_meaning, ?), sentence_ar = COALESCE(sentence_ar, ?), context_note = COALESCE(context_note, ?) WHERE id = ?',
        contextual_meaning || null, sentence_ar || null, context_note || null, ex.id,
      );
      return get('SELECT * FROM occurrences WHERE id = ?', ex.id);
    }
    return ex;
  }
  const v = await get('SELECT * FROM vocabulary WHERE id = ?', vocabularyId);
  const sp = v ? findSpan(v.term, line.text, { pos: v.part_of_speech, type: v.item_type }) : null;
  const id = await insert(
    `INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, sentence_ar, contextual_meaning, context_note, timestamp_seconds)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    vocabularyId, line.source_id, line.id, sp?.start ?? null, sp?.end ?? null, line.text, sentence_ar || line.text_ar || null,
    contextual_meaning || null, context_note || null, floorOrNull(line.start_seconds),
  );
  return get('SELECT * FROM occurrences WHERE id = ?', id);
}
