// Data access layer — the single source of truth for every screen.
// Synchronous and deterministic; AI orchestration lives in service.js.
import { all, get, run, tx, localDate } from './db.js';
import { applyReview, isDifficult, statusOf, isDue } from './srs.js';
import { matchKey, singularCandidates, sentenceKey } from '../public/js/shared/text.js';
import { findSpan } from './matcher.js';

export const DEFAULT_USER_ID = 1;

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/* ================================================================ users */

export function ensureUser(id = DEFAULT_USER_ID) {
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (u) return u;
  run('INSERT INTO users (id, name) VALUES (?, ?)', id, 'Learner');
  return get('SELECT * FROM users WHERE id = ?', id);
}

export function updateUser(id, patch) {
  for (const key of ['name', 'daily_goal', 'speak_arabic', 'speech_rate']) {
    if (patch[key] !== undefined) run(`UPDATE users SET ${key} = ? WHERE id = ?`, patch[key], id);
  }
  return ensureUser(id);
}

/* ====================================================== global knowledge */

/**
 * Find the vocabulary row for a term, deterministically:
 * exact match key first, then simple singular forms ("reports" → "report").
 */
export function findVocabulary(term) {
  const key = matchKey(term);
  if (!key) return null;
  const exact = get('SELECT * FROM vocabulary WHERE match_key = ?', key);
  if (exact) return exact;
  if (!key.includes(' ')) {
    for (const s of singularCandidates(key)) {
      const row = get('SELECT * FROM vocabulary WHERE match_key = ?', s);
      if (row) return row;
    }
  }
  return null;
}

const BAND_FOR = { A1: 'basic', A2: 'basic', B1: 'useful', B2: 'useful', C1: 'advanced', C2: 'advanced' };
const FILLABLE = ['item_type', 'part_of_speech', 'level', 'band', 'usefulness', 'pronunciation', 'arabic', 'simple_english', 'topic'];

/**
 * Insert a vocabulary item, or enrich the existing one. Existing values are
 * NEVER overwritten — new information only fills gaps — so analysing another
 * video can't change the meaning of a word you already learned.
 * @returns {{id:number, created:boolean, filled:string[]}}
 */
export function upsertVocabulary(item) {
  const existing = findVocabulary(item.term);
  const values = {
    item_type: item.item_type || (item.term.trim().includes(' ') ? 'expression' : 'word'),
    part_of_speech: item.part_of_speech || item.pos || null,
    level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(item.level) ? item.level : null,
    band: item.band || BAND_FOR[item.level] || null,
    usefulness: Number.isFinite(item.usefulness) ? item.usefulness : null,
    pronunciation: item.pronunciation || null,
    arabic: item.arabic || null,
    simple_english: item.simple_english || null,
    topic: item.topic || null,
  };
  let id;
  let created = false;
  const filled = [];
  if (existing) {
    id = existing.id;
    for (const k of FILLABLE) {
      if ((existing[k] === null || existing[k] === undefined || existing[k] === '') && values[k] !== null && values[k] !== undefined) {
        run(`UPDATE vocabulary SET ${k} = ? WHERE id = ?`, values[k], id);
        filled.push(k);
      }
    }
    if (existing.similar_json === '[]' && item.similar?.length) run('UPDATE vocabulary SET similar_json = ? WHERE id = ?', JSON.stringify(item.similar), id);
  } else {
    id = Number(run(
      `INSERT INTO vocabulary (term, match_key, item_type, part_of_speech, level, band, usefulness, pronunciation, arabic, simple_english, similar_json, topic, origin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      item.term.trim(), matchKey(item.term), values.item_type, values.part_of_speech, values.level, values.band, values.usefulness,
      values.pronunciation, values.arabic, values.simple_english, JSON.stringify(item.similar || []), values.topic, item.origin || null,
    ).lastInsertRowid);
    created = true;
  }
  if (item.example) addExample(id, item.example, item.example_arabic, 'example');
  if (item.easy_example) addExample(id, item.easy_example, item.easy_example_arabic, 'easy');
  return { id, created, filled };
}

/** Add an example unless the same sentence is already stored. Returns true if added. */
export function addExample(vocabularyId, sentence, arabic, kind = 'example') {
  const s = String(sentence || '').trim();
  if (!s) return false;
  const key = sentenceKey(s);
  const dup = get('SELECT id, arabic FROM examples WHERE vocabulary_id = ? AND sentence_key = ?', vocabularyId, key);
  if (dup) {
    if (!dup.arabic && arabic) run('UPDATE examples SET arabic = ? WHERE id = ?', arabic, dup.id);
    return false;
  }
  run('INSERT INTO examples (vocabulary_id, kind, sentence, sentence_key, arabic) VALUES (?,?,?,?,?)', vocabularyId, kind, s, key, arabic || null);
  return true;
}

function examplesFor(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = all(`SELECT vocabulary_id, kind, sentence, arabic FROM examples WHERE vocabulary_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
  for (const r of rows) {
    if (!map.has(r.vocabulary_id)) map.set(r.vocabulary_id, []);
    map.get(r.vocabulary_id).push({ kind: r.kind, sentence: r.sentence, arabic: r.arabic });
  }
  return map;
}

export function vocabularyPublic(v) {
  return {
    vocabulary_id: v.id,
    term: v.term,
    item_type: v.item_type,
    part_of_speech: v.part_of_speech,
    level: v.level,
    band: v.band,
    pronunciation: v.pronunciation,
    arabic_general: v.arabic,
    simple_english: v.simple_english,
    similar: JSON.parse(v.similar_json || '[]'),
    topic: v.topic,
  };
}

/* =============================================================== sources */

export function getSource(id) {
  return get('SELECT * FROM sources WHERE id = ?', id);
}

export function findSourceByYoutubeId(youtubeId) {
  return get('SELECT * FROM sources WHERE youtube_id = ?', youtubeId);
}

export function listSources(userId = DEFAULT_USER_ID, limit = 50) {
  return all(
    `SELECT s.*,
       (SELECT COUNT(*) FROM occurrences o WHERE o.source_id = s.id AND o.suggested = 1) AS item_count,
       (SELECT COUNT(*) FROM user_vocabulary uv WHERE uv.source_id = s.id AND uv.user_id = ? AND uv.state='saved') AS saved_count,
       (SELECT COUNT(*) FROM transcript_lines l WHERE l.source_id = s.id) AS line_count
     FROM sources s ORDER BY s.analyzed_at DESC LIMIT ?`,
    userId, limit,
  );
}

export function sourceLines(sourceId) {
  return all('SELECT id, idx, start_seconds, duration, text, text_ar FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
}

/**
 * Store a source with its full transcript (lines) and the extracted items.
 * items[].line refers to a line idx. Re-analysing replaces lines/occurrences
 * but keeps the learner's saved words and re-links them to the new lines.
 */
export function saveSource(meta, lines, items, userId = DEFAULT_USER_ID) {
  return tx(() => {
    let source = meta.youtube_id ? findSourceByYoutubeId(meta.youtube_id) : null;
    const now = new Date().toISOString();
    if (source) {
      run(
        `UPDATE sources SET url=?, title=?, channel=?, duration_seconds=?, thumbnail_url=?, transcript_source=?, extractor=?, word_count=?,
           translation_status='none', analyzed_at=? WHERE id=?`,
        meta.url, meta.title, meta.channel, meta.duration_seconds, meta.thumbnail_url, meta.transcript_source, meta.extractor, meta.word_count, now, source.id,
      );
      run('DELETE FROM transcript_lines WHERE source_id = ?', source.id); // cascades to occurrences
    } else {
      const id = run(
        `INSERT INTO sources (kind, youtube_id, url, title, channel, duration_seconds, thumbnail_url, transcript_source, extractor, word_count, is_demo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        meta.kind || 'youtube', meta.youtube_id || null, meta.url || null, meta.title, meta.channel || null, meta.duration_seconds ?? null,
        meta.thumbnail_url || null, meta.transcript_source || null, meta.extractor || null, meta.word_count ?? null, meta.is_demo ? 1 : 0,
      ).lastInsertRowid;
      source = getSource(Number(id));
    }
    const lineIds = new Map();
    lines.forEach((l, i) => {
      const next = lines[i + 1];
      const dur = l.start !== null && l.start !== undefined && next?.start != null ? Math.max(0, next.start - l.start) : null;
      const id = Number(run(
        'INSERT INTO transcript_lines (source_id, idx, start_seconds, duration, text, text_ar) VALUES (?,?,?,?,?,?)',
        source.id, l.idx, l.start ?? null, dur, l.text, l.text_ar || null,
      ).lastInsertRowid);
      lineIds.set(l.idx, { id, ...l });
    });

    const addOccurrence = (vocabId, line, span, extra = {}) => {
      if (!line) return null;
      const existing = get('SELECT id FROM occurrences WHERE source_id=? AND vocabulary_id=? AND line_id=?', source.id, vocabId, line.id);
      if (existing) {
        if (extra.suggested) {
          run(`UPDATE occurrences SET suggested=1, rank=?, contextual_meaning=COALESCE(contextual_meaning, ?), sentence_ar=COALESCE(sentence_ar, ?) WHERE id=?`,
            extra.rank ?? 0, extra.contextual_meaning || null, extra.sentence_ar || null, existing.id);
        }
        return existing.id;
      }
      return Number(run(
        `INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, sentence_ar, contextual_meaning, timestamp_seconds, suggested, rank)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        vocabId, source.id, line.id, span?.start ?? null, span?.end ?? null, line.text, extra.sentence_ar || line.text_ar || null,
        extra.contextual_meaning || null, line.start != null ? Math.floor(line.start) : null, extra.suggested ? 1 : 0, extra.rank ?? 0,
      ).lastInsertRowid);
    };

    const lineList = [...lineIds.values()];
    items.forEach((item, rank) => {
      const { id: vocabId } = upsertVocabulary(item);
      const line = lineIds.get(item.line);
      if (line && item.context_arabic && !line.text_ar) {
        run('UPDATE transcript_lines SET text_ar = ? WHERE id = ?', item.context_arabic, line.id);
        line.text_ar = item.context_arabic;
      }
      const span = line ? findSpan(item.term, line.text, { pos: item.part_of_speech, type: item.item_type }) : null;
      addOccurrence(vocabId, line, span, { suggested: true, rank, contextual_meaning: item.contextual_meaning, sentence_ar: item.context_arabic });
      // Every other line where the item appears becomes an extra context.
      let extra = 0;
      for (const l of lineList) {
        if (l === line || extra >= 20) continue;
        const sp = findSpan(item.term, l.text, { pos: item.part_of_speech, type: item.item_type });
        if (sp) {
          addOccurrence(vocabId, l, sp);
          extra += 1;
        }
      }
    });
    linkSavedWords(source.id, userId);
    return source.id;
  });
}

/**
 * Mark the learner's saved words wherever they appear in a source, so they
 * are highlighted and gain this sentence as an extra context.
 */
export function linkSavedWords(sourceId, userId = DEFAULT_USER_ID) {
  const lines = all('SELECT id, start_seconds AS start, text, text_ar FROM transcript_lines WHERE source_id = ? ORDER BY idx', sourceId);
  const saved = all(
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
      const ex = get('SELECT id FROM occurrences WHERE source_id=? AND vocabulary_id=? AND line_id=?', sourceId, w.vocabulary_id, l.id);
      const occId = ex
        ? ex.id
        : Number(run(
          `INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, sentence_ar, timestamp_seconds) VALUES (?,?,?,?,?,?,?,?)`,
          w.vocabulary_id, sourceId, l.id, sp.start, sp.end, l.text, l.text_ar || null, l.start != null ? Math.floor(l.start) : null,
        ).lastInsertRowid);
      if (!w.occurrence_id) {
        run('UPDATE user_vocabulary SET occurrence_id = ?, source_id = COALESCE(source_id, ?) WHERE id = ?', occId, sourceId, w.uv_id);
        w.occurrence_id = occId;
      }
    }
  }
}

/** Everything the reader needs: lines, word marks and the suggested list. */
export function sourceView(sourceId, userId = DEFAULT_USER_ID) {
  const source = getSource(sourceId);
  if (!source) throw httpError(404, 'لم نجد هذا المصدر.');
  const lines = sourceLines(sourceId);
  const occ = all(
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
  const ex = examplesFor([...new Set(occ.map((o) => o.vocabulary_id))]);
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
      source: sourceRef(source),
    }));
  return { source, lines, marks, items };
}

export function sourceRef(s) {
  if (!s) return null;
  return { id: s.id, kind: s.kind, youtube_id: s.youtube_id, title: s.title, channel: s.channel, is_demo: !!s.is_demo, thumbnail_url: s.thumbnail_url };
}

export function deleteSource(id) {
  run('DELETE FROM sources WHERE id = ?', id);
}

/** Get or create the occurrence of a vocabulary item on a specific line. */
export function occurrenceFor(vocabularyId, lineId, { contextual_meaning, sentence_ar, context_note } = {}) {
  const line = get('SELECT * FROM transcript_lines WHERE id = ?', lineId);
  if (!line) return null;
  const ex = get('SELECT * FROM occurrences WHERE source_id=? AND vocabulary_id=? AND line_id=?', line.source_id, vocabularyId, line.id);
  if (ex) {
    if ((contextual_meaning && !ex.contextual_meaning) || (sentence_ar && !ex.sentence_ar) || (context_note && !ex.context_note)) {
      run('UPDATE occurrences SET contextual_meaning = COALESCE(contextual_meaning, ?), sentence_ar = COALESCE(sentence_ar, ?), context_note = COALESCE(context_note, ?) WHERE id = ?',
        contextual_meaning || null, sentence_ar || null, context_note || null, ex.id);
    }
    if (sentence_ar && !line.text_ar) run('UPDATE transcript_lines SET text_ar = ? WHERE id = ?', sentence_ar, line.id);
    return get('SELECT * FROM occurrences WHERE id = ?', ex.id);
  }
  const v = get('SELECT * FROM vocabulary WHERE id = ?', vocabularyId);
  const sp = v ? findSpan(v.term, line.text, { pos: v.part_of_speech, type: v.item_type }) : null;
  const id = Number(run(
    `INSERT INTO occurrences (vocabulary_id, source_id, line_id, char_start, char_end, sentence, sentence_ar, contextual_meaning, context_note, timestamp_seconds)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    vocabularyId, line.source_id, line.id, sp?.start ?? null, sp?.end ?? null, line.text, sentence_ar || line.text_ar || null,
    contextual_meaning || null, context_note || null, line.start_seconds != null ? Math.floor(line.start_seconds) : null,
  ).lastInsertRowid);
  if (sentence_ar && !line.text_ar) run('UPDATE transcript_lines SET text_ar = ? WHERE id = ?', sentence_ar, line.id);
  return get('SELECT * FROM occurrences WHERE id = ?', id);
}

/* ======================================================= user knowledge */

/**
 * Save a vocabulary item to the learner's words (explicit action only).
 * @returns {{uv_id:number, already:boolean}}
 */
export function saveWord(userId, vocabularyId, { occurrenceId = null, sourceId = null, userArabic = null, groupIds = [] } = {}) {
  return tx(() => {
    const occ = occurrenceId ? get('SELECT * FROM occurrences WHERE id = ?', occurrenceId) : null;
    const srcId = sourceId ?? occ?.source_id ?? null;
    const existing = get('SELECT * FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', userId, vocabularyId);
    let uvId;
    let already = false;
    if (existing) {
      uvId = existing.id;
      already = existing.state === 'saved';
      if (!already) run(`UPDATE user_vocabulary SET state='saved', saved_at=? WHERE id=?`, new Date().toISOString(), uvId);
      if (!existing.occurrence_id && occ) run('UPDATE user_vocabulary SET occurrence_id=?, source_id=COALESCE(source_id, ?) WHERE id=?', occ.id, srcId, uvId);
      if (userArabic && !existing.user_arabic) run('UPDATE user_vocabulary SET user_arabic=? WHERE id=?', userArabic, uvId);
    } else {
      uvId = Number(run(
        `INSERT INTO user_vocabulary (user_id, vocabulary_id, occurrence_id, source_id, state, user_arabic, saved_at) VALUES (?,?,?,?, 'saved', ?, ?)`,
        userId, vocabularyId, occ?.id ?? null, srcId, userArabic || null, new Date().toISOString(),
      ).lastInsertRowid);
    }
    for (const g of groupIds) addToGroup(userId, g, [uvId]);
    return { uv_id: uvId, already };
  });
}

export function dismissWord(userId, vocabularyId) {
  const existing = get('SELECT * FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', userId, vocabularyId);
  if (existing) {
    if (existing.state === 'saved' && existing.review_count > 0) return existing.id; // never silently drop progress
    run(`UPDATE user_vocabulary SET state='dismissed' WHERE id=?`, existing.id);
    return existing.id;
  }
  return Number(run(`INSERT INTO user_vocabulary (user_id, vocabulary_id, state) VALUES (?,?, 'dismissed')`, userId, vocabularyId).lastInsertRowid);
}

export function unsaveWord(userId, uvId) {
  run('DELETE FROM user_vocabulary WHERE id=? AND user_id=?', uvId, userId);
}

/** Remove several words at once (progress included). Returns how many. */
export function unsaveWords(userId, uvIds) {
  let n = 0;
  tx(() => {
    for (const id of uvIds) n += Number(run('DELETE FROM user_vocabulary WHERE id=? AND user_id=?', id, userId).changes);
  });
  return n;
}

export function resetVocabularyState(userId, vocabularyId) {
  run('DELETE FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', userId, vocabularyId);
}

export function updateWord(userId, uvId, patch) {
  const uv = get('SELECT * FROM user_vocabulary WHERE id=? AND user_id=?', uvId, userId);
  if (!uv) throw httpError(404, 'لم نجد هذه الكلمة.');
  if (patch.user_arabic !== undefined) run('UPDATE user_vocabulary SET user_arabic=? WHERE id=?', patch.user_arabic?.trim() || null, uvId);
  if (patch.example) {
    addExample(uv.vocabulary_id, patch.example, patch.example_arabic, 'user');
  }
  return getWord(userId, uvId);
}

/** State of a vocabulary item for the learner (for panels and imports). */
export function userStateFor(userId, vocabularyId) {
  const uv = get('SELECT id, state, user_arabic FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', userId, vocabularyId);
  if (!uv) return { uv_id: null, state: null, groups: [] };
  return { uv_id: uv.id, state: uv.state, user_arabic: uv.user_arabic, groups: groupIdsFor(uv.id) };
}

const WORD_SELECT = `
  SELECT uv.*, uv.id AS uv_id,
    v.term, v.item_type, v.part_of_speech, v.level, v.band, v.usefulness, v.pronunciation, v.arabic AS arabic_general,
    v.simple_english, v.similar_json, v.topic,
    o.sentence AS context_sentence, o.sentence_ar AS context_arabic, o.contextual_meaning, o.timestamp_seconds,
    s.kind AS source_kind, s.youtube_id, s.title AS source_title, s.channel AS source_channel, s.is_demo AS source_is_demo, s.thumbnail_url AS source_thumbnail,
    (SELECT group_concat(group_id) FROM word_group_items gi WHERE gi.user_vocabulary_id = uv.id) AS group_ids
  FROM user_vocabulary uv
  JOIN vocabulary v ON v.id = uv.vocabulary_id
  LEFT JOIN occurrences o ON o.id = uv.occurrence_id
  LEFT JOIN sources s ON s.id = uv.source_id
  WHERE uv.user_id = ? AND uv.state = 'saved'`;

function toWord(r, ex, now) {
  return {
    uv_id: r.uv_id,
    vocabulary_id: r.vocabulary_id,
    term: r.term,
    item_type: r.item_type,
    part_of_speech: r.part_of_speech,
    level: r.level,
    band: r.band,
    pronunciation: r.pronunciation,
    arabic: r.user_arabic || r.contextual_meaning || r.arabic_general || null,
    arabic_general: r.arabic_general,
    user_arabic: r.user_arabic,
    simple_english: r.simple_english,
    similar: JSON.parse(r.similar_json || '[]'),
    topic: r.topic,
    context_sentence: r.context_sentence,
    context_arabic: r.context_arabic,
    timestamp_seconds: r.timestamp_seconds,
    examples: ex.get(r.vocabulary_id) || [],
    source: r.source_id
      ? { id: r.source_id, kind: r.source_kind, youtube_id: r.youtube_id, title: r.source_title, channel: r.source_channel, is_demo: !!r.source_is_demo, thumbnail_url: r.source_thumbnail }
      : null,
    group_ids: r.group_ids ? String(r.group_ids).split(',').map(Number) : [],
    saved_at: r.saved_at,
    status: statusOf(r),
    difficult: isDifficult(r),
    difficulty: r.difficulty,
    due: r.review_count > 0 && isDue(r, now),
    recent: r.recent,
    last_wrong_at: r.last_wrong_at,
    review_count: r.review_count,
    correct_count: r.correct_count,
    wrong_count: r.wrong_count,
    mastery: r.mastery,
    interval_days: r.interval_days,
    last_reviewed_at: r.last_reviewed_at,
    next_review_at: r.next_review_at,
  };
}

function hydrate(rows) {
  const ex = examplesFor([...new Set(rows.map((r) => r.vocabulary_id))]);
  const now = new Date();
  return rows.map((r) => toWord(r, ex, now));
}

export function getWord(userId, uvId) {
  const rows = all(`${WORD_SELECT} AND uv.id = ?`, userId, uvId);
  if (!rows.length) throw httpError(404, 'لم نجد هذه الكلمة.');
  const w = hydrate(rows)[0];
  w.history = all('SELECT source, grade, correct, created_at FROM review_logs WHERE user_vocabulary_id = ? ORDER BY id DESC LIMIT 20', uvId)
    .map((h) => ({ ...h, correct: !!h.correct }));
  w.contexts = contextsFor(w.vocabulary_id);
  return w;
}

/** All places a word was seen (multiple contexts, newest sources first). */
export function contextsFor(vocabularyId, limit = 12) {
  return all(
    `SELECT o.id AS occurrence_id, o.sentence, o.sentence_ar, o.contextual_meaning, o.timestamp_seconds, o.line_id,
       s.id AS source_id, s.kind, s.title, s.youtube_id, s.is_demo
     FROM occurrences o JOIN sources s ON s.id = o.source_id
     WHERE o.vocabulary_id = ? ORDER BY o.suggested DESC, s.analyzed_at DESC, o.id LIMIT ?`,
    vocabularyId, limit,
  ).map((c) => ({ ...c, is_demo: !!c.is_demo }));
}

function dayOffset(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * filters: q, level, status (new|learning|mastered|due|difficult), group_id,
 * source_id, section (today|yesterday|week|month|previous), from, to, ids
 */
export function listWords(userId, filters = {}) {
  let sql = WORD_SELECT;
  const params = [userId];
  if (filters.level) {
    sql += ' AND v.level = ?';
    params.push(filters.level);
  }
  if (filters.source_id) {
    sql += ' AND uv.source_id = ?';
    params.push(Number(filters.source_id));
  }
  if (filters.group_id) {
    sql += ' AND uv.id IN (SELECT user_vocabulary_id FROM word_group_items WHERE group_id = ?)';
    params.push(Number(filters.group_id));
  }
  if (filters.ids?.length) {
    sql += ` AND uv.id IN (${filters.ids.map(() => '?').join(',')})`;
    params.push(...filters.ids.map(Number));
  }
  if (filters.q) {
    sql += ' AND (v.term LIKE ? OR v.arabic LIKE ? OR uv.user_arabic LIKE ? OR o.contextual_meaning LIKE ?)';
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  const ranges = { today: [dayOffset(0), null], yesterday: [dayOffset(1), dayOffset(0)], week: [dayOffset(6), null], month: [dayOffset(30), null] };
  if (ranges[filters.section]) {
    const [from, to] = ranges[filters.section];
    sql += ' AND uv.saved_at >= ?';
    params.push(from.toISOString());
    if (to) {
      sql += ' AND uv.saved_at < ?';
      params.push(to.toISOString());
    }
  }
  if (filters.section === 'previous') {
    sql += ' AND uv.saved_at < ?';
    params.push(dayOffset(6).toISOString());
  }
  if (filters.from) {
    sql += ' AND uv.saved_at >= ?';
    params.push(new Date(`${filters.from}T00:00:00`).toISOString());
  }
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    sql += ' AND uv.saved_at < ?';
    params.push(end.toISOString());
  }
  sql += ' ORDER BY uv.saved_at DESC, uv.id DESC';
  let words = hydrate(all(sql, ...params));
  const st = filters.status;
  if (st === 'due') words = words.filter((w) => w.due);
  else if (st === 'difficult') words = words.filter((w) => w.difficult);
  else if (st) words = words.filter((w) => w.status === st);
  return words;
}

/* ================================================================ reviews */

export function recordReview(userId, uvId, grade, source = 'flashcard') {
  return tx(() => {
    const uv = get('SELECT * FROM user_vocabulary WHERE id=? AND user_id=?', uvId, userId);
    if (!uv) throw httpError(404, 'لم نجد هذه الكلمة.');
    const isGame = source.startsWith('game:') || source === 'quiz';
    const scheduling = !isGame || uv.review_count === 0 || isDue(uv);
    const next = applyReview(uv, grade, { scheduling });
    run(
      `UPDATE user_vocabulary SET review_count=?, correct_count=?, wrong_count=?, streak_correct=?, lapses=?, ease=?, interval_days=?, mastery=?,
         difficulty=?, recent=?, last_wrong_at=?, last_reviewed_at=?, next_review_at=? WHERE id=?`,
      next.review_count, next.correct_count, next.wrong_count, next.streak_correct, next.lapses, next.ease, next.interval_days, next.mastery,
      next.difficulty, next.recent, next.last_wrong_at ?? null, next.last_reviewed_at, next.next_review_at, uv.id,
    );
    run(`INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at) VALUES (?,?,?,?,?,?,?)`,
      userId, uv.id, source, grade, grade === 'hard' ? 0 : 1, next.interval_days, next.last_reviewed_at);
    const plan = get('SELECT id FROM daily_plans WHERE user_id=? AND plan_date=?', userId, localDate());
    if (plan) {
      run('UPDATE daily_plan_items SET completed_at = COALESCE(completed_at, ?) WHERE plan_id=? AND user_vocabulary_id=?', next.last_reviewed_at, plan.id, uv.id);
    }
    return { uv_id: uv.id, status: statusOf(next), difficult: isDifficult(next), mastery: next.mastery, next_review_at: next.next_review_at, difficulty: next.difficulty };
  });
}

/* ========================================================= daily learning */

function pick(list, n, taken) {
  const out = [];
  for (const w of list) {
    if (out.length >= n) break;
    if (taken.has(w.uv_id)) continue;
    taken.add(w.uv_id);
    out.push(w);
  }
  return out;
}

const recentlyWrong = (w, days = 7) => w.last_wrong_at && w.recent?.endsWith('0') && Date.now() - new Date(w.last_wrong_at).getTime() < days * 86400000;

function buildPlanSelection(words, goal, taken = new Set()) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const endIso = end.toISOString();
  const byNext = (a, b) => (a.next_review_at || '').localeCompare(b.next_review_at || '');
  const difficult = words.filter((w) => w.difficult).sort((a, b) => b.difficulty - a.difficulty);
  const mistakes = words.filter((w) => recentlyWrong(w)).sort((a, b) => (b.last_wrong_at || '').localeCompare(a.last_wrong_at || ''));
  const review = words.filter((w) => w.review_count > 0 && w.next_review_at && w.next_review_at <= endIso).sort(byNext);
  const fresh = words.filter((w) => w.review_count === 0).sort((a, b) => a.saved_at.localeCompare(b.saved_at));
  const nDifficult = Math.max(1, Math.round(goal * 0.2));
  const nMistakes = Math.max(0, Math.round(goal * 0.1));
  const nReview = Math.round(goal * 0.4);
  const nNew = goal - nDifficult - nMistakes - nReview;
  const sel = [
    ...pick(difficult, nDifficult, taken).map((w) => ['difficult', w]),
    ...pick(mistakes, nMistakes, taken).map((w) => ['mistakes', w]),
    ...pick(review, nReview, taken).map((w) => ['review', w]),
    ...pick(fresh, nNew, taken).map((w) => ['new', w]),
  ];
  for (const [bucket, list] of [['review', review], ['new', fresh], ['review', [...words].sort((a, b) => a.mastery - b.mastery)]]) {
    if (sel.length >= goal) break;
    sel.push(...pick(list, goal - sel.length, taken).map((w) => [bucket, w]));
  }
  return sel;
}

export function getTodayPlan(userId = DEFAULT_USER_ID) {
  const user = ensureUser(userId);
  const today = localDate();
  let plan = get('SELECT * FROM daily_plans WHERE user_id=? AND plan_date=?', userId, today);
  if (!plan) {
    const sel = buildPlanSelection(listWords(userId), user.daily_goal);
    plan = tx(() => {
      const id = Number(run('INSERT INTO daily_plans (user_id, plan_date) VALUES (?,?)', userId, today).lastInsertRowid);
      sel.forEach(([bucket, w], i) => run('INSERT INTO daily_plan_items (plan_id, user_vocabulary_id, bucket, position) VALUES (?,?,?,?)', id, w.uv_id, bucket, i));
      return get('SELECT * FROM daily_plans WHERE id=?', id);
    });
  }
  return planView(userId, plan);
}

export function extendTodayPlan(userId, count = 5) {
  const current = getTodayPlan(userId);
  const taken = new Set(current.items.map((i) => i.uv_id));
  const sel = buildPlanSelection(listWords(userId), count, taken);
  tx(() => sel.forEach(([bucket, w], i) => run('INSERT OR IGNORE INTO daily_plan_items (plan_id, user_vocabulary_id, bucket, position) VALUES (?,?,?,?)', current.id, w.uv_id, bucket, current.items.length + i)));
  return getTodayPlan(userId);
}

function planView(userId, plan) {
  const items = all('SELECT * FROM daily_plan_items WHERE plan_id=? ORDER BY position', plan.id);
  const words = items.length ? listWords(userId, { ids: items.map((i) => i.user_vocabulary_id) }) : [];
  const byId = new Map(words.map((w) => [w.uv_id, w]));
  const list = items.filter((i) => byId.has(i.user_vocabulary_id)).map((i) => ({ ...byId.get(i.user_vocabulary_id), bucket: i.bucket, completed: !!i.completed_at }));
  const counts = { new: 0, review: 0, difficult: 0, mistakes: 0 };
  for (const i of list) counts[i.bucket] += 1;
  return { id: plan.id, date: plan.plan_date, items: list, counts, total: list.length, completed: list.filter((i) => i.completed).length };
}

/* =============================================================== practice */

/**
 * Words for a practice round, most-needed first.
 *  - ids: replay exactly these (e.g. the words just missed) + a few support words
 *  - group_id: words of one group
 *  - focus 'difficult' | 'due' | 'smart' (default)
 */
export function practiceSet(userId, { ids, group_id, focus = 'smart', size = 10 } = {}) {
  const everything = listWords(userId);
  const need = (w) => {
    let s = 0;
    if (recentlyWrong(w, 1)) {
      // Missed in the last 24h: counts as more urgent than "due", and the
      // fresher the mistake, the sooner it comes back.
      const hours = (Date.now() - new Date(w.last_wrong_at).getTime()) / 3600000;
      s += 140 + 30 * Math.max(0, 1 - hours / 24);
    } else if (w.due) {
      s += 40 + Math.min(30, (Date.now() - new Date(w.next_review_at).getTime()) / 86400000);
    }
    s += 50 * (w.difficulty || 0);
    if (w.review_count === 0) s += 25;
    s += (100 - w.mastery) / 10;
    return s;
  };
  let words;
  if (ids?.length) {
    const want = new Set(ids.map(Number));
    words = everything.filter((w) => want.has(w.uv_id));
    // Support words so a round never feels empty: weakest other words.
    const minRound = 5;
    if (words.length < minRound) {
      const support = everything.filter((w) => !want.has(w.uv_id)).sort((a, b) => need(b) - need(a)).slice(0, minRound - words.length);
      words = [...words, ...support.map((w) => ({ ...w, support: true }))];
    }
    return { words, distractors: everything };
  }
  let pool = everything;
  if (group_id) pool = listWords(userId, { group_id });
  if (focus === 'difficult') pool = pool.filter((w) => w.difficult || recentlyWrong(w));
  if (focus === 'due') pool = pool.filter((w) => w.due);
  if (focus === 'new') pool = pool.filter((w) => w.review_count === 0);
  words = [...pool].sort((a, b) => need(b) - need(a)).slice(0, size);
  return { words, distractors: everything };
}

/* ================================================================== stats */

export function streak(userId) {
  const days = all(`SELECT DISTINCT date(created_at, 'localtime') AS d FROM review_logs WHERE user_id=? ORDER BY d DESC LIMIT 400`, userId).map((r) => r.d);
  const set = new Set(days);
  const cursor = new Date();
  if (!set.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (set.has(localDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current: count, studied_today: set.has(localDate()) };
}

export function stats(userId = DEFAULT_USER_ID) {
  const words = listWords(userId);
  const plan = getTodayPlan(userId);
  const attention = words
    .filter((w) => w.difficult || recentlyWrong(w, 3))
    // fresh mistakes first, then the hardest words
    .sort((a, b) => Number(recentlyWrong(b, 1)) - Number(recentlyWrong(a, 1)) || (b.difficulty || 0) - (a.difficulty || 0))
    .slice(0, 6)
    .map((w) => ({ uv_id: w.uv_id, term: w.term, arabic: w.arabic, level: w.level }));
  return {
    total: words.length,
    new: words.filter((w) => w.status === 'new').length,
    learning: words.filter((w) => w.status === 'learning').length,
    mastered: words.filter((w) => w.status === 'mastered').length,
    due: words.filter((w) => w.due).length,
    difficult: words.filter((w) => w.difficult).length,
    saved_today: words.filter((w) => w.saved_at >= dayOffset(0).toISOString()).length,
    plan: { total: plan.total, completed: plan.completed, counts: plan.counts },
    attention,
    streak: streak(userId),
  };
}

/* ================================================================= groups */

export function listGroups(userId = DEFAULT_USER_ID) {
  const groups = all('SELECT * FROM word_groups WHERE user_id=? ORDER BY name COLLATE NOCASE', userId);
  if (!groups.length) return [];
  const words = listWords(userId);
  return groups.map((g) => {
    const ws = words.filter((w) => w.group_ids.includes(g.id));
    return {
      ...g,
      count: ws.length,
      due: ws.filter((w) => w.due).length,
      difficult: ws.filter((w) => w.difficult).length,
      mastered: ws.filter((w) => w.status === 'mastered').length,
      progress: ws.length ? Math.round(ws.reduce((s, w) => s + w.mastery, 0) / ws.length) : 0,
    };
  });
}

export function createGroup(userId, name, color = null) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw httpError(400, 'اكتب اسم المجموعة.');
  const dup = get('SELECT * FROM word_groups WHERE user_id=? AND name = ? COLLATE NOCASE', userId, clean);
  if (dup) return { ...dup, existed: true };
  const id = Number(run('INSERT INTO word_groups (user_id, name, color) VALUES (?,?,?)', userId, clean, color).lastInsertRowid);
  return { ...get('SELECT * FROM word_groups WHERE id=?', id), existed: false };
}

export function renameGroup(userId, id, name) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw httpError(400, 'اكتب اسم المجموعة.');
  const dup = get('SELECT id FROM word_groups WHERE user_id=? AND name = ? COLLATE NOCASE AND id <> ?', userId, clean, id);
  if (dup) throw httpError(409, 'عندك مجموعة بهذا الاسم.');
  run('UPDATE word_groups SET name=? WHERE id=? AND user_id=?', clean, id, userId);
  return get('SELECT * FROM word_groups WHERE id=?', id);
}

export function deleteGroup(userId, id) {
  run('DELETE FROM word_groups WHERE id=? AND user_id=?', id, userId);
}

function ownGroup(userId, groupId) {
  const g = get('SELECT * FROM word_groups WHERE id=? AND user_id=?', groupId, userId);
  if (!g) throw httpError(404, 'لم نجد هذه المجموعة.');
  return g;
}

export function addToGroup(userId, groupId, uvIds) {
  ownGroup(userId, groupId);
  for (const uv of uvIds) {
    if (get('SELECT 1 FROM user_vocabulary WHERE id=? AND user_id=?', uv, userId)) {
      run('INSERT OR IGNORE INTO word_group_items (group_id, user_vocabulary_id) VALUES (?,?)', groupId, uv);
    }
  }
}

export function removeFromGroup(userId, groupId, uvIds) {
  ownGroup(userId, groupId);
  for (const uv of uvIds) run('DELETE FROM word_group_items WHERE group_id=? AND user_vocabulary_id=?', groupId, uv);
}

export function groupIdsFor(uvId) {
  return all('SELECT group_id FROM word_group_items WHERE user_vocabulary_id=?', uvId).map((r) => r.group_id);
}

/** Replace a word's group membership with exactly groupIds. */
export function setWordGroups(userId, uvId, groupIds) {
  if (!get('SELECT 1 FROM user_vocabulary WHERE id=? AND user_id=?', uvId, userId)) throw httpError(404, 'لم نجد هذه الكلمة.');
  tx(() => {
    const want = new Set(groupIds.map(Number));
    for (const g of groupIds) ownGroup(userId, g);
    for (const g of groupIdsFor(uvId)) if (!want.has(g)) run('DELETE FROM word_group_items WHERE group_id=? AND user_vocabulary_id=?', g, uvId);
    for (const g of want) run('INSERT OR IGNORE INTO word_group_items (group_id, user_vocabulary_id) VALUES (?,?)', g, uvId);
  });
  return groupIdsFor(uvId);
}

/* ================================================================= export */

/**
 * filters: range (all|3m|month|week|custom), from, to, group_id, level, difficult
 */
export function exportRows(userId, f = {}) {
  const filters = { level: f.level || undefined, group_id: f.group_id || undefined };
  if (f.range === '3m') filters.from = localDate(dayOffset(91));
  else if (f.range === 'month') filters.from = localDate(dayOffset(30));
  else if (f.range === 'week') filters.from = localDate(dayOffset(6));
  else if (f.range === 'custom') {
    filters.from = f.from || undefined;
    filters.to = f.to || undefined;
  }
  if (f.difficult === '1' || f.difficult === true) filters.status = 'difficult';
  const words = listWords(userId, filters);
  const groups = new Map(all('SELECT id, name FROM word_groups WHERE user_id=?', userId).map((g) => [g.id, g.name]));
  return words.map((w) => {
    const ex = w.examples.find((e) => e.kind === 'user') || w.examples.find((e) => e.kind === 'example') || w.examples[0];
    return {
      Word: w.term,
      Arabic: w.arabic || '',
      'CEFR Level': w.level || '',
      'Part of Speech': w.part_of_speech || '',
      'Simple English': w.simple_english || '',
      Example: w.context_sentence || ex?.sentence || '',
      'Example Arabic': w.context_sentence ? w.context_arabic || '' : ex?.arabic || '',
      Group: w.group_ids.map((g) => groups.get(g)).filter(Boolean).join('; '),
      Topic: w.topic || '',
      Source: w.source?.title || '',
      'Saved Date': w.saved_at.slice(0, 10),
      Mastery: w.mastery,
      Correct: w.correct_count,
      Wrong: w.wrong_count,
      Difficult: w.difficult ? 'yes' : 'no',
    };
  });
}

export function toCsv(rows) {
  if (!rows.length) return '﻿Word,Arabic\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic correctly.
  return `﻿${[cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')}\r\n`;
}
