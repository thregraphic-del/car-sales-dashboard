// The learner's words: saving, editing, removing, and the word list with
// its learning state (status, difficulty, due) computed in one place.
import { all, get, run, insert, tx } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { isDifficult, statusOf, isDue } from '../lib/srs.js';
import { startOfDay, midnightOf } from '../lib/time.js';
import { addExample, examplesFor } from './vocabulary.js';
import { addToGroup, groupIdsFor } from './groups.js';

/**
 * Save a vocabulary item to the learner's words (explicit action only).
 * @returns {Promise<{uv_id:number, already:boolean}>}
 */
export async function saveWord(userId, vocabularyId, { occurrenceId = null, sourceId = null, userArabic = null, groupIds = [] } = {}) {
  return tx(async () => {
    if (!await get('SELECT 1 AS x FROM vocabulary WHERE id = ?', vocabularyId)) throw httpError(404, 'لم نجد هذه الكلمة.');
    const occ = occurrenceId ? await get('SELECT * FROM occurrences WHERE id = ? AND vocabulary_id = ?', occurrenceId, vocabularyId) : null;
    const srcId = sourceId ?? occ?.source_id ?? null;
    const existing = await get('SELECT * FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?', userId, vocabularyId);
    let uvId;
    let already = false;
    const now = new Date().toISOString();
    if (existing) {
      uvId = existing.id;
      already = existing.state === 'saved';
      if (!already) await run(`UPDATE user_vocabulary SET state = 'saved', saved_at = ? WHERE id = ?`, now, uvId);
      if (!existing.occurrence_id && occ) await run('UPDATE user_vocabulary SET occurrence_id = ?, source_id = COALESCE(source_id, ?) WHERE id = ?', occ.id, srcId, uvId);
      if (userArabic && !existing.user_arabic) await run('UPDATE user_vocabulary SET user_arabic = ? WHERE id = ?', userArabic, uvId);
    } else {
      uvId = await insert(
        `INSERT INTO user_vocabulary (user_id, vocabulary_id, occurrence_id, source_id, state, user_arabic, saved_at) VALUES (?,?,?,?, 'saved', ?, ?)`,
        userId, vocabularyId, occ?.id ?? null, srcId, userArabic || null, now,
      );
    }
    for (const g of groupIds) await addToGroup(userId, g, [uvId]);
    return { uv_id: uvId, already };
  });
}

/** "Not useful": hide the item from suggestions (never drops learning progress). */
export async function dismissWord(userId, vocabularyId) {
  const existing = await get('SELECT * FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?', userId, vocabularyId);
  if (existing) {
    if (existing.state === 'saved' && existing.review_count > 0) return existing.id;
    await run(`UPDATE user_vocabulary SET state = 'dismissed' WHERE id = ?`, existing.id);
    return existing.id;
  }
  return insert(`INSERT INTO user_vocabulary (user_id, vocabulary_id, state) VALUES (?,?, 'dismissed')`, userId, vocabularyId);
}

export async function unsaveWord(userId, uvId) {
  await run('DELETE FROM user_vocabulary WHERE id = ? AND user_id = ?', uvId, userId);
}

/** Remove several words at once (progress included). Returns how many. */
export async function unsaveWords(userId, uvIds) {
  return tx(async () => {
    let n = 0;
    for (const id of uvIds) n += (await run('DELETE FROM user_vocabulary WHERE id = ? AND user_id = ?', id, userId)).changes;
    return n;
  });
}

export async function resetVocabularyState(userId, vocabularyId) {
  await run('DELETE FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?', userId, vocabularyId);
}

export async function updateWord(userId, uvId, patch) {
  const uv = await get('SELECT * FROM user_vocabulary WHERE id = ? AND user_id = ?', uvId, userId);
  if (!uv) throw httpError(404, 'لم نجد هذه الكلمة.');
  if (patch.user_arabic !== undefined) await run('UPDATE user_vocabulary SET user_arabic = ? WHERE id = ?', patch.user_arabic?.trim() || null, uvId);
  if (patch.example) await addExample(uv.vocabulary_id, patch.example, patch.example_arabic, 'user');
  return getWord(userId, uvId);
}

/** State of a vocabulary item for the learner (for panels and imports). */
export async function userStateFor(userId, vocabularyId) {
  const uv = await get('SELECT id, state, user_arabic FROM user_vocabulary WHERE user_id = ? AND vocabulary_id = ?', userId, vocabularyId);
  if (!uv) return { uv_id: null, state: null, user_arabic: null, groups: [] };
  return { uv_id: uv.id, state: uv.state, user_arabic: uv.user_arabic, groups: await groupIdsFor(uv.id) };
}

const WORD_SELECT = `
  SELECT uv.*, uv.id AS uv_id,
    v.term, v.item_type, v.part_of_speech, v.level, v.band, v.usefulness, v.pronunciation, v.arabic AS arabic_general,
    v.simple_english, v.similar_json, v.topic,
    o.sentence AS context_sentence, o.sentence_ar AS context_arabic, o.contextual_meaning, o.timestamp_seconds,
    s.kind AS source_kind, s.youtube_id, s.title AS source_title, s.channel AS source_channel, s.is_demo AS source_is_demo, s.thumbnail_url AS source_thumbnail,
    (SELECT group_concat(gi.group_id) FROM word_group_items gi WHERE gi.user_vocabulary_id = uv.id) AS group_ids
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

async function hydrate(rows) {
  const ex = await examplesFor([...new Set(rows.map((r) => r.vocabulary_id))]);
  const now = new Date();
  return rows.map((r) => toWord(r, ex, now));
}

export async function getWord(userId, uvId) {
  const rows = await all(`${WORD_SELECT} AND uv.id = ?`, userId, uvId);
  if (!rows.length) throw httpError(404, 'لم نجد هذه الكلمة.');
  const [w] = await hydrate(rows);
  w.history = (await all('SELECT source, grade, correct, created_at FROM review_logs WHERE user_vocabulary_id = ? ORDER BY id DESC LIMIT 20', uvId))
    .map((h) => ({ ...h, correct: !!h.correct }));
  w.contexts = await contextsFor(w.vocabulary_id);
  return w;
}

/** All places a word was seen (multiple contexts, newest sources first). */
export async function contextsFor(vocabularyId, limit = 12) {
  return (await all(
    `SELECT o.id AS occurrence_id, o.sentence, o.sentence_ar, o.contextual_meaning, o.timestamp_seconds, o.line_id,
       s.id AS source_id, s.kind, s.title, s.youtube_id, s.is_demo
     FROM occurrences o JOIN sources s ON s.id = o.source_id
     WHERE o.vocabulary_id = ? ORDER BY o.suggested DESC, s.analyzed_at DESC, o.id LIMIT ?`,
    vocabularyId, limit,
  )).map((c) => ({ ...c, is_demo: !!c.is_demo }));
}

const nextDate = (d) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/**
 * filters: q, level, status (new|learning|mastered|due|difficult), group_id,
 * source_id, section (today|yesterday|week|month|previous), from, to, ids.
 * Days follow the learner's calendar (config.app.timezone).
 */
export async function listWords(userId, filters = {}) {
  let sql = WORD_SELECT;
  const params = [userId];
  const and = (clause, ...p) => {
    sql += ` AND ${clause}`;
    params.push(...p);
  };
  if (filters.level) and('v.level = ?', filters.level);
  if (filters.source_id) and('uv.source_id = ?', Number(filters.source_id));
  if (filters.group_id) and('uv.id IN (SELECT user_vocabulary_id FROM word_group_items WHERE group_id = ?)', Number(filters.group_id));
  if (filters.ids) {
    if (!filters.ids.length) return [];
    and(`uv.id IN (${filters.ids.map(() => '?').join(',')})`, ...filters.ids.map(Number));
  }
  if (filters.q) {
    const like = `%${String(filters.q).toLowerCase()}%`;
    and('(lower(v.term) LIKE ? OR v.arabic LIKE ? OR uv.user_arabic LIKE ? OR o.contextual_meaning LIKE ?)', like, like, like, like);
  }
  const day = (n) => startOfDay(n).toISOString();
  const ranges = { today: [day(0), null], yesterday: [day(1), day(0)], week: [day(6), null], month: [day(30), null], previous: [null, day(6)] };
  const range = ranges[filters.section];
  if (range?.[0]) and('uv.saved_at >= ?', range[0]);
  if (range?.[1]) and('uv.saved_at < ?', range[1]);
  if (filters.from) and('uv.saved_at >= ?', midnightOf(filters.from).toISOString());
  if (filters.to) and('uv.saved_at < ?', midnightOf(nextDate(filters.to)).toISOString());
  sql += ' ORDER BY uv.saved_at DESC, uv.id DESC';
  let words = await hydrate(await all(sql, ...params));
  const st = filters.status;
  if (st === 'due') words = words.filter((w) => w.due);
  else if (st === 'difficult') words = words.filter((w) => w.difficult);
  else if (st) words = words.filter((w) => w.status === st);
  return words;
}
