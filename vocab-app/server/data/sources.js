// Sources (YouTube videos and texts): full transcripts, where each item
// occurs, and the reader view. Re-analysing keeps the learner's saved words.
//
// Every source belongs to one learner (sources.user_id); transcript lines and
// contexts belong to that learner through their source. Functions that take
// an id coming from a request also take the userId and only find the
// learner's own rows — another learner's id behaves exactly like a missing one.
import { isSimplified } from './simplest.js';
import { usageOf } from '../lib/usage.js';
import { all, get, run, insert, tx } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { findSpan } from '../lib/matcher.js';
import { upsertVocabulary, examplesFor, vocabularyPublic } from './vocabulary.js';

const floorOrNull = (n) => (n !== null && n !== undefined ? Math.floor(n) : null);

export async function getSource(id, userId) {
  return (await get('SELECT * FROM sources WHERE id = ? AND user_id = ?', id, userId)) || null;
}

/** Remember where the learner stopped watching. */
export async function setProgress(id, userId, seconds) {
  await run('UPDATE sources SET progress_seconds = ? WHERE id = ? AND user_id = ?', seconds, id, userId);
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
  const rows = await all('SELECT id, idx, start_seconds, duration, text, text_ar, words_json, align_json FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  return rows.map(({ words_json: w, align_json: a, ...l }) => ({ ...l, words: parseWords(w), align: parseAlign(a) }));
}

/** [[from, to, arabic], ...] or null. */
export const parseAlign = (json) => {
  if (!json) return null;
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) && a.length ? a : null;
  } catch {
    return null;
  }
};

/** Lines still without a phrase alignment, from line index `fromIdx` on (then from the start). */
export async function unalignedLines(sourceId, fromIdx, limit, skip = 0) {
  const cols = 'id, idx, text, text_ar, words_json';
  const after = await all(`SELECT ${cols} FROM transcript_lines WHERE source_id = ? AND (align_json IS NULL OR align_json IN ('[]', '"x"')) AND idx >= ? ORDER BY idx LIMIT ? OFFSET ?`, sourceId, fromIdx, limit, skip);
  const rows = after.length ? after : await all(`SELECT ${cols} FROM transcript_lines WHERE source_id = ? AND (align_json IS NULL OR align_json IN ('[]', '"x"')) ORDER BY idx LIMIT ? OFFSET ?`, sourceId, limit, skip);
  return rows.map(({ words_json: w, ...l }) => ({ ...l, words: parseWords(w) }));
}

export async function alignCounts(sourceId) {
  const r = await get(`SELECT COUNT(*) AS total, COUNT(CASE WHEN align_json IS NOT NULL AND align_json NOT IN ('[]', '"x"') THEN 1 END) AS aligned FROM transcript_lines WHERE source_id = ?`, sourceId);
  return { total: Number(r.total), aligned: Number(r.aligned) };
}

/** rows: [{id, align, ar}] — the Arabic line is filled from the phrases when missing. */
export async function storeAlignments(rows) {
  await tx(async () => {
    for (const r of rows) {
      await run('UPDATE transcript_lines SET align_json = ? WHERE id = ?', JSON.stringify(r.align), r.id);
      if (r.ar) await run('UPDATE transcript_lines SET text_ar = ? WHERE id = ? AND text_ar IS NULL', r.ar, r.id);
    }
  });
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
  for (const [i, raw] of items.entries()) {
    // show and save the shortest basic form (struggling → struggle, decision → decide)
    // (done right after the video opens, in short steps, so adding a video stays fast)
    const item = raw;
    const { id: vocabId } = await upsertVocabulary(item);
    const line = byIdx.get(item.line);
    if (line && item.context_arabic && !line.text_ar) {
      await run('UPDATE transcript_lines SET text_ar = ? WHERE id = ? AND text_ar IS NULL', item.context_arabic, line.id);
      line.text_ar = item.context_arabic;
    }
    const opts = { pos: item.part_of_speech, type: item.item_type };
    const already = line ? await get('SELECT 1 AS x FROM occurrences WHERE source_id = ? AND vocabulary_id = ? AND suggested = 1', sourceId, vocabId) : null;
    const span = line ? findSpan(raw.term, line.text, { pos: raw.part_of_speech, type: raw.item_type }) || findSpan(item.term, line.text, opts) : null;
    await addOccurrence(sourceId, vocabId, line, span, {
      suggested: true, rank: item.rank ?? rankBase + i, contextual_meaning: item.contextual_meaning, sentence_ar: item.context_arabic,
    });
    if (line && !already) added += 1;
    let extra = 0;
    for (const l of lineList) {
      if (l === line || extra >= 8) continue;
      const sp = findSpan(raw.term, l.text, { pos: raw.part_of_speech, type: raw.item_type }) || findSpan(item.term, l.text, opts);
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
      for (const r of await all('SELECT text, text_ar, align_json FROM transcript_lines WHERE source_id = ? AND text_ar IS NOT NULL', source.id)) keepAr.set(r.text.trim(), { ar: r.text_ar, align: r.align_json });
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
        `SELECT l.text, l.text_ar, l.align_json FROM transcript_lines l JOIN sources s ON s.id = l.source_id
         WHERE s.youtube_id = ? AND l.text_ar IS NOT NULL AND s.id <> ?`, meta.youtube_id, source.id,
      );
      for (const r of rows) {
        const prev = known.get(r.text.trim());
        if (!prev || (!prev.align && r.align_json)) known.set(r.text.trim(), { ar: r.text_ar, align: r.align_json });
      }
    }
    for (const [k, v] of keepAr) known.set(k, v);
    // all lines in a few multi-row INSERTs (one per line made long videos time out on the hosting)
    const prepared = lines.map((l0, i) => {
      let l = l0;
      const k = known.get(l.text.trim());
      if (k && !l.text_ar) l = { ...l, text_ar: k.ar };
      const align = k?.align && k.ar === l.text_ar ? k.align : null;
      const next = lines[i + 1];
      const dur = l.start !== null && l.start !== undefined && next?.start != null ? Math.max(0, next.start - l.start) : null;
      return { l, row: [source.id, l.idx, l.start ?? null, l.duration ?? dur, l.text, l.text_ar || null, l.words?.length ? JSON.stringify(l.words) : null, align] };
    });
    const ids = new Map();
    for (let i = 0; i < prepared.length; i += 400) {
      const part = prepared.slice(i, i + 400);
      const got = await all(
        `INSERT INTO transcript_lines (source_id, idx, start_seconds, duration, text, text_ar, words_json, align_json) VALUES ${part.map(() => '(?,?,?,?,?,?,?,?)').join(',')} RETURNING id, idx`,
        ...part.flatMap((x) => x.row),
      );
      for (const r of got) ids.set(Number(r.idx), r.id);
    }
    const lineList = prepared.map(({ l }) => ({ id: ids.get(Number(l.idx)), ...l, start: l.start ?? null, text_ar: l.text_ar || null }));
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
export async function linkSavedWords(sourceId, userId, { perWord = 3 } = {}) {
  const lines = await all('SELECT id, start_seconds AS start, text, text_ar FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  const saved = await all(
    `SELECT uv.id AS uv_id, uv.occurrence_id, v.id AS vocabulary_id, v.term, v.part_of_speech, v.item_type
     FROM user_vocabulary uv JOIN vocabulary v ON v.id = uv.vocabulary_id WHERE uv.user_id = ? AND uv.state = 'saved'`,
    userId,
  );
  // what this source already has (one query), then all new contexts in a few multi-row INSERTs
  const have = new Set((await all('SELECT vocabulary_id, line_id FROM occurrences WHERE source_id = ?', sourceId)).map((o) => `${o.vocabulary_id}:${o.line_id}`));
  const add = [];
  const firstOf = new Map(); // uv_id → the first new context, for words that have none yet
  for (const w of saved) {
    let count = 0;
    for (const l of lines) {
      if (count >= perWord) break;
      const sp = findSpan(w.term, l.text, { pos: w.part_of_speech, type: w.item_type });
      if (!sp) continue;
      count += 1;
      const key = `${w.vocabulary_id}:${l.id}`;
      if (have.has(key)) continue;
      have.add(key);
      if (!w.occurrence_id && !firstOf.has(w.uv_id)) firstOf.set(w.uv_id, key);
      add.push({ key, row: [w.vocabulary_id, sourceId, l.id, sp.start ?? null, sp.end ?? null, l.text, l.text_ar || null, null, floorOrNull(l.start), 0, 0] });
    }
  }
  const idOf = new Map();
  for (let i = 0; i < add.length; i += 300) {
    const part = add.slice(i, i + 300);
    const got = await all(
      `INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, sentence_ar, contextual_meaning, timestamp_seconds, suggested, rank)
       VALUES ${part.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',')} RETURNING id, vocabulary_id, line_id`,
      ...part.flatMap((x) => x.row),
    );
    for (const r of got) idOf.set(`${r.vocabulary_id}:${r.line_id}`, r.id);
  }
  for (const [uvId, key] of firstOf) {
    const occId = idOf.get(key);
    if (occId) await run('UPDATE user_vocabulary SET occurrence_id = ?, source_id = COALESCE(source_id, ?) WHERE id = ?', occId, sourceId, uvId);
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
    .map((o) => ({ line_id: o.line_id, start: o.char_start, end: o.char_end, vocabulary_id: o.vocabulary_id, occurrence_id: o.id, state: o.user_state || null, light: o.suggested && o.rank >= 1000, usage: usageOf(o.term, o.level) }));
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
  source.simplified = await isSimplified(sourceId);
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

/**
 * Suggest every word of the built-in dictionary that the source uses (except the
 * most basic ones): found through its inflections (went → go), one context each,
 * after the AI's choices. Fast enough for one request (no AI).
 */
export async function addDictionaryWords(sourceId, { skipTop = 150, limit = 700 } = {}) {
  const { COMMON_WORDS } = await import('../lib/common-words.js');
  const rankOf = new Map(COMMON_WORDS.map((w, i) => [w, i]));
  const lines = await all('SELECT id, idx, start_seconds, text, text_ar FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  // first place and count of every word form
  const forms = new Map();
  for (const l of lines) {
    for (const m of l.text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
      const f = m[0].toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
      const hit = forms.get(f);
      if (hit) hit.n += 1;
      else forms.set(f, { n: 1, line: l, start: m.index, end: m.index + m[0].length });
    }
  }
  const list = [...forms.keys()];
  const lemmaOf = new Map();
  for (let i = 0; i < list.length; i += 400) {
    const part = list.slice(i, i + 400);
    for (const r of await all(`SELECT form, lemma FROM lemma_index WHERE form IN (${part.map(() => '?').join(',')})`, ...part)) lemmaOf.set(r.form, r.lemma);
  }
  // lemma → first appearance and total count
  const byLemma = new Map();
  for (const [f, info] of forms) {
    const lemma = lemmaOf.get(f);
    if (!lemma) continue;
    const cur = byLemma.get(lemma);
    if (!cur) byLemma.set(lemma, { ...info });
    else cur.n += info.n;
  }
  const lemmas = [...byLemma.keys()].filter((l) => (rankOf.get(l) ?? 99999) >= skipTop);
  const vocab = new Map();
  for (let i = 0; i < lemmas.length; i += 400) {
    const part = lemmas.slice(i, i + 400);
    for (const r of await all(`SELECT id, term FROM vocabulary WHERE origin = 'dictionary' AND term IN (${part.map(() => '?').join(',')})`, ...part)) vocab.set(r.term, r.id);
  }
  const already = new Set((await all('SELECT vocabulary_id FROM occurrences WHERE source_id = ? AND suggested = 1', sourceId)).map((r) => r.vocabulary_id));
  // most used in this video first, then the rarer (more useful) words
  const chosen = lemmas.filter((l) => vocab.has(l) && !already.has(vocab.get(l)))
    .sort((a, b) => byLemma.get(b).n - byLemma.get(a).n || (rankOf.get(b) ?? 0) - (rankOf.get(a) ?? 0))
    .slice(0, limit);
  await tx(async () => {
    for (const [i, lemma] of chosen.entries()) {
      const h = byLemma.get(lemma);
      await addOccurrence(sourceId, vocab.get(lemma), { ...h.line, start: h.line.start_seconds }, { start: h.start, end: h.end }, { suggested: true, rank: 1000 + i });
    }
    await run('UPDATE sources SET dict_words_at = ? WHERE id = ?', new Date().toISOString(), sourceId);
  });
  return { added: chosen.length };
}
