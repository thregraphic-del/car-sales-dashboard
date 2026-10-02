// Data access layer: every page of the app goes through these functions,
// so there is exactly one source of truth (the relational database).
import { all, get, run, tx, localDate, normaliseTerm } from './db.js';
import { applyReview, isDifficult, statusOf, isDue } from './srs.js';

export const DEFAULT_USER_ID = 1;

/* ------------------------------------------------------------------ users */

export function ensureUser(id = DEFAULT_USER_ID) {
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (u) return u;
  run('INSERT INTO users (id, name) VALUES (?, ?)', id, 'Learner');
  return get('SELECT * FROM users WHERE id = ?', id);
}

export function updateUser(id, patch) {
  const allowed = ['name', 'daily_goal', 'speak_arabic', 'speech_rate'];
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    run(`UPDATE users SET ${key} = ? WHERE id = ?`, patch[key], id);
  }
  return ensureUser(id);
}

/* ----------------------------------------------------------- vocabulary */

/** Insert or update a dictionary item and its examples; returns vocabulary id. */
export function upsertVocabulary(item) {
  const key = normaliseTerm(item.term);
  const pos = item.part_of_speech || null;
  const existing = get(
    'SELECT id FROM vocabulary WHERE term_key = ? AND part_of_speech IS ?',
    key,
    pos,
  );
  const similar = JSON.stringify(item.similar || []);
  let id;
  if (existing) {
    id = existing.id;
    run(
      `UPDATE vocabulary SET term=?, item_type=?, level=?, usefulness=?, pronunciation=COALESCE(?, pronunciation),
         arabic=?, simple_english=?, similar_json=CASE WHEN ?='[]' THEN similar_json ELSE ? END,
         topic=COALESCE(?, topic) WHERE id=?`,
      item.term, item.item_type || 'word', item.level, item.usefulness ?? 70, item.pronunciation || null,
      item.arabic, item.simple_english, similar, similar, item.topic || null, id,
    );
  } else {
    id = Number(
      run(
        `INSERT INTO vocabulary (term, term_key, item_type, part_of_speech, level, usefulness, pronunciation,
           arabic, simple_english, similar_json, topic) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        item.term, key, item.item_type || 'word', pos, item.level, item.usefulness ?? 70,
        item.pronunciation || null, item.arabic, item.simple_english, similar, item.topic || null,
      ).lastInsertRowid,
    );
  }
  const examples = [];
  if (item.example) examples.push({ kind: 'example', sentence: item.example, arabic: item.example_arabic });
  if (item.easy_example) examples.push({ kind: 'easy', sentence: item.easy_example, arabic: item.easy_example_arabic });
  for (const ex of examples) {
    const dup = get('SELECT id FROM examples WHERE vocabulary_id=? AND sentence=?', id, ex.sentence);
    if (!dup) {
      run('INSERT INTO examples (vocabulary_id, kind, sentence, arabic) VALUES (?,?,?,?)', id, ex.kind, ex.sentence, ex.arabic || null);
    }
  }
  return id;
}

function examplesFor(ids) {
  if (!ids.length) return new Map();
  const rows = all(
    `SELECT vocabulary_id, kind, sentence, arabic FROM examples WHERE vocabulary_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
    ...ids,
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.vocabulary_id)) map.set(r.vocabulary_id, []);
    map.get(r.vocabulary_id).push({ kind: r.kind, sentence: r.sentence, arabic: r.arabic });
  }
  return map;
}

/* --------------------------------------------------------------- videos */

export function findVideoByYoutubeId(youtubeId) {
  return get('SELECT * FROM videos WHERE youtube_id = ?', youtubeId);
}

export function getVideo(id) {
  return get('SELECT * FROM videos WHERE id = ?', id);
}

export function listVideos(userId = DEFAULT_USER_ID) {
  return all(
    `SELECT vid.*,
       (SELECT COUNT(*) FROM video_vocabulary vv WHERE vv.video_id = vid.id) AS item_count,
       (SELECT COUNT(*) FROM user_vocabulary uv WHERE uv.source_video_id = vid.id AND uv.user_id = ? AND uv.state='saved') AS saved_count
     FROM videos vid ORDER BY vid.analyzed_at DESC`,
    userId,
  );
}

/** Store a full analysis result (video + extracted items) atomically. */
export function saveAnalysis(video, items) {
  return tx(() => {
    let row = findVideoByYoutubeId(video.youtube_id);
    if (row) {
      run(
        `UPDATE videos SET url=?, title=?, channel=?, duration_seconds=?, thumbnail_url=?, transcript_source=?,
           extractor=?, word_count=?, analyzed_at=? WHERE id=?`,
        video.url, video.title, video.channel, video.duration_seconds, video.thumbnail_url,
        video.transcript_source, video.extractor, video.word_count, new Date().toISOString(), row.id,
      );
      // Keep rows the learner saved from; replace the rest.
      run(
        `DELETE FROM video_vocabulary WHERE video_id = ? AND id NOT IN
           (SELECT video_vocabulary_id FROM user_vocabulary WHERE video_vocabulary_id IS NOT NULL)`,
        row.id,
      );
    } else {
      const id = run(
        `INSERT INTO videos (youtube_id, url, title, channel, duration_seconds, thumbnail_url, transcript_source,
           extractor, word_count, is_demo) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        video.youtube_id, video.url, video.title, video.channel, video.duration_seconds, video.thumbnail_url,
        video.transcript_source, video.extractor, video.word_count, video.is_demo ? 1 : 0,
      ).lastInsertRowid;
      row = getVideo(Number(id));
    }
    items.forEach((item, rank) => {
      const vocabId = upsertVocabulary(item);
      const existing = get('SELECT id FROM video_vocabulary WHERE video_id=? AND vocabulary_id=?', row.id, vocabId);
      if (existing) {
        run(
          `UPDATE video_vocabulary SET context_sentence=?, context_arabic=?, contextual_meaning=?, timestamp_seconds=?, rank=? WHERE id=?`,
          item.context, item.context_arabic || null, item.contextual_meaning || item.arabic,
          item.timestamp_seconds ?? null, rank, existing.id,
        );
      } else {
        run(
          `INSERT INTO video_vocabulary (video_id, vocabulary_id, context_sentence, context_arabic, contextual_meaning,
             timestamp_seconds, rank) VALUES (?,?,?,?,?,?,?)`,
          row.id, vocabId, item.context, item.context_arabic || null, item.contextual_meaning || item.arabic,
          item.timestamp_seconds ?? null, rank,
        );
      }
    });
    return row.id;
  });
}

/** Items found in a video, with the learner's saved/dismissed state. */
export function videoItems(videoId, userId = DEFAULT_USER_ID) {
  const rows = all(
    `SELECT vv.id AS video_vocabulary_id, vv.context_sentence, vv.context_arabic, vv.contextual_meaning,
       vv.timestamp_seconds, vv.rank, v.*, v.id AS vocabulary_id, uv.state AS user_state, uv.id AS uv_id
     FROM video_vocabulary vv
     JOIN vocabulary v ON v.id = vv.vocabulary_id
     LEFT JOIN user_vocabulary uv ON uv.vocabulary_id = v.id AND uv.user_id = ?
     WHERE vv.video_id = ?
     ORDER BY vv.rank`,
    userId,
    videoId,
  );
  const ex = examplesFor(rows.map((r) => r.vocabulary_id));
  const video = getVideo(videoId);
  return rows.map((r) => ({
    video_vocabulary_id: r.video_vocabulary_id,
    vocabulary_id: r.vocabulary_id,
    uv_id: r.uv_id,
    user_state: r.user_state || null,
    term: r.term,
    item_type: r.item_type,
    part_of_speech: r.part_of_speech,
    level: r.level,
    usefulness: r.usefulness,
    pronunciation: r.pronunciation,
    arabic: r.contextual_meaning || r.arabic,
    arabic_general: r.arabic,
    simple_english: r.simple_english,
    similar: JSON.parse(r.similar_json || '[]'),
    topic: r.topic,
    context_sentence: r.context_sentence,
    context_arabic: r.context_arabic,
    timestamp_seconds: r.timestamp_seconds,
    examples: ex.get(r.vocabulary_id) || [],
    video: videoRef(video),
  }));
}

function videoRef(v) {
  if (!v) return null;
  return { id: v.id, youtube_id: v.youtube_id, title: v.title, channel: v.channel, is_demo: !!v.is_demo, thumbnail_url: v.thumbnail_url };
}

/* ----------------------------------------------------- user vocabulary */

export function saveWord(userId, videoVocabularyId) {
  const vv = get('SELECT * FROM video_vocabulary WHERE id = ?', videoVocabularyId);
  if (!vv) throw httpError(404, 'Item not found');
  const existing = get('SELECT * FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', userId, vv.vocabulary_id);
  if (existing) {
    if (existing.state !== 'saved') {
      run(
        `UPDATE user_vocabulary SET state='saved', saved_at=?, video_vocabulary_id=?, source_video_id=? WHERE id=?`,
        new Date().toISOString(), vv.id, vv.video_id, existing.id,
      );
    }
    return existing.id;
  }
  return Number(
    run(
      `INSERT INTO user_vocabulary (user_id, vocabulary_id, video_vocabulary_id, source_video_id, state, saved_at)
       VALUES (?,?,?,?, 'saved', ?)`,
      userId, vv.vocabulary_id, vv.id, vv.video_id, new Date().toISOString(),
    ).lastInsertRowid,
  );
}

export function dismissWord(userId, videoVocabularyId) {
  const vv = get('SELECT * FROM video_vocabulary WHERE id = ?', videoVocabularyId);
  if (!vv) throw httpError(404, 'Item not found');
  const existing = get('SELECT * FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', userId, vv.vocabulary_id);
  if (existing) {
    run(`UPDATE user_vocabulary SET state='dismissed' WHERE id=?`, existing.id);
    return existing.id;
  }
  return Number(
    run(
      `INSERT INTO user_vocabulary (user_id, vocabulary_id, video_vocabulary_id, source_video_id, state)
       VALUES (?,?,?,?, 'dismissed')`,
      userId, vv.vocabulary_id, vv.id, vv.video_id,
    ).lastInsertRowid,
  );
}

/** Remove a word from the learner's list (keeps it in the dictionary). */
export function unsaveWord(userId, uvId) {
  run(`DELETE FROM user_vocabulary WHERE id=? AND user_id=?`, uvId, userId);
}

const WORD_SELECT = `
  SELECT uv.*, uv.id AS uv_id,
    v.term, v.item_type, v.part_of_speech, v.level, v.usefulness, v.pronunciation, v.arabic AS arabic_general,
    v.simple_english, v.similar_json, v.topic,
    vv.context_sentence, vv.context_arabic, vv.contextual_meaning, vv.timestamp_seconds,
    vid.youtube_id, vid.title AS video_title, vid.channel AS video_channel, vid.is_demo AS video_is_demo,
    vid.thumbnail_url AS video_thumbnail,
    (SELECT correct FROM review_logs rl WHERE rl.user_vocabulary_id = uv.id ORDER BY rl.id DESC LIMIT 1) AS last_correct
  FROM user_vocabulary uv
  JOIN vocabulary v ON v.id = uv.vocabulary_id
  LEFT JOIN video_vocabulary vv ON vv.id = uv.video_vocabulary_id
  LEFT JOIN videos vid ON vid.id = uv.source_video_id
  WHERE uv.user_id = ? AND uv.state = 'saved'`;

function toWord(r, ex, now = new Date()) {
  const due = r.review_count > 0 && isDue(r, now);
  return {
    uv_id: r.uv_id,
    vocabulary_id: r.vocabulary_id,
    term: r.term,
    item_type: r.item_type,
    part_of_speech: r.part_of_speech,
    level: r.level,
    usefulness: r.usefulness,
    pronunciation: r.pronunciation,
    arabic: r.contextual_meaning || r.arabic_general,
    arabic_general: r.arabic_general,
    simple_english: r.simple_english,
    similar: JSON.parse(r.similar_json || '[]'),
    topic: r.topic,
    context_sentence: r.context_sentence,
    context_arabic: r.context_arabic,
    timestamp_seconds: r.timestamp_seconds,
    examples: ex.get(r.vocabulary_id) || [],
    video: r.source_video_id
      ? { id: r.source_video_id, youtube_id: r.youtube_id, title: r.video_title, channel: r.video_channel, is_demo: !!r.video_is_demo, thumbnail_url: r.video_thumbnail }
      : null,
    saved_at: r.saved_at,
    status: statusOf(r),
    difficult: isDifficult(r),
    due,
    last_correct: r.last_correct === null || r.last_correct === undefined ? null : !!r.last_correct,
    review_count: r.review_count,
    correct_count: r.correct_count,
    wrong_count: r.wrong_count,
    lapses: r.lapses,
    mastery: r.mastery,
    ease: r.ease,
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
  if (!rows.length) throw httpError(404, 'Word not found');
  const word = hydrate(rows)[0];
  word.history = all(
    `SELECT source, grade, correct, interval_after, created_at FROM review_logs
     WHERE user_vocabulary_id = ? ORDER BY id DESC LIMIT 30`,
    uvId,
  ).map((h) => ({ ...h, correct: !!h.correct }));
  word.campaigns = all(
    `SELECT c.id, c.name FROM campaign_items ci JOIN campaigns c ON c.id = ci.campaign_id WHERE ci.user_vocabulary_id = ?`,
    uvId,
  );
  return word;
}

function dayOffset(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * List the learner's saved words.
 * filters: q, level, status (new|learning|mastered|due|difficult), video_id, section, from, to, campaign_id, ids
 */
export function listWords(userId, filters = {}) {
  let sql = WORD_SELECT;
  const params = [userId];
  if (filters.level) {
    sql += ' AND v.level = ?';
    params.push(filters.level);
  }
  if (filters.video_id) {
    sql += ' AND uv.source_video_id = ?';
    params.push(Number(filters.video_id));
  }
  if (filters.topic) {
    sql += ' AND v.topic = ?';
    params.push(filters.topic);
  }
  if (filters.campaign_id) {
    sql += ' AND uv.id IN (SELECT user_vocabulary_id FROM campaign_items WHERE campaign_id = ?)';
    params.push(Number(filters.campaign_id));
  }
  if (filters.ids?.length) {
    sql += ` AND uv.id IN (${filters.ids.map(() => '?').join(',')})`;
    params.push(...filters.ids.map(Number));
  }
  if (filters.q) {
    sql += ` AND (v.term LIKE ? OR v.arabic LIKE ? OR v.simple_english LIKE ? OR vv.contextual_meaning LIKE ?)`;
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  // Date filters compare against local-midnight boundaries converted to UTC ISO.
  const section = filters.section || 'all';
  const ranges = {
    today: [dayOffset(0), null],
    yesterday: [dayOffset(1), dayOffset(0)],
    week: [dayOffset(6), null],
    month: [dayOffset(30), null],
  };
  if (ranges[section]) {
    const [from, to] = ranges[section];
    sql += ' AND uv.saved_at >= ?';
    params.push(from.toISOString());
    if (to) {
      sql += ' AND uv.saved_at < ?';
      params.push(to.toISOString());
    }
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

  if (section === 'review') words = words.filter((w) => w.due);
  if (section === 'difficult') words = words.filter((w) => w.difficult);
  if (section === 'previous') {
    const cutoff = dayOffset(6).toISOString();
    words = words.filter((w) => w.saved_at < cutoff);
  }
  const status = filters.status;
  if (status === 'due') words = words.filter((w) => w.due);
  else if (status === 'difficult') words = words.filter((w) => w.difficult);
  else if (status) words = words.filter((w) => w.status === status);
  return words;
}

/* ------------------------------------------------------------- reviews */

/**
 * Record an answer. grade: hard|good|easy. source: flashcard|today|game:<name>.
 * Game answers on words that are not due only update counters/mastery (not the
 * schedule), except wrong answers which always pull the word back sooner.
 */
export function recordReview(userId, uvId, grade, source = 'flashcard') {
  return tx(() => {
    const uv = get('SELECT * FROM user_vocabulary WHERE id=? AND user_id=?', uvId, userId);
    if (!uv) throw httpError(404, 'Word not found');
    const isGame = source.startsWith('game:');
    const scheduling = !isGame || uv.review_count === 0 || isDue(uv);
    const next = applyReview(uv, grade, { scheduling });
    run(
      `UPDATE user_vocabulary SET review_count=?, correct_count=?, wrong_count=?, streak_correct=?, lapses=?, ease=?,
         interval_days=?, mastery=?, last_reviewed_at=?, next_review_at=? WHERE id=?`,
      next.review_count, next.correct_count, next.wrong_count, next.streak_correct, next.lapses, next.ease,
      next.interval_days, next.mastery, next.last_reviewed_at, next.next_review_at, uv.id,
    );
    run(
      `INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      userId, uv.id, source, grade, grade === 'hard' ? 0 : 1, next.interval_days, next.last_reviewed_at,
    );
    // Any study of a word that is in today's plan counts as completing it.
    const plan = get('SELECT id FROM daily_plans WHERE user_id=? AND plan_date=?', userId, localDate());
    if (plan) {
      run(
        `UPDATE daily_plan_items SET completed_at = COALESCE(completed_at, ?) WHERE plan_id=? AND user_vocabulary_id=?`,
        next.last_reviewed_at, plan.id, uv.id,
      );
    }
    return { ...next, status: statusOf(next), difficult: isDifficult(next) };
  });
}

/* ------------------------------------------------------- daily learning */

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

function buildPlanSelection(words, goal, taken = new Set()) {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const end = endOfDay.toISOString();
  const byNext = (a, b) => (a.next_review_at || '').localeCompare(b.next_review_at || '');

  const difficult = words.filter((w) => w.difficult).sort((a, b) => a.mastery - b.mastery);
  const mistakes = words.filter((w) => w.last_correct === false).sort(byNext);
  const review = words
    .filter((w) => w.review_count > 0 && w.next_review_at && w.next_review_at <= end)
    .sort(byNext);
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
  // Fill any shortfall: due reviews first, then new words, then weakest words.
  const fillers = [
    ['review', review],
    ['new', fresh],
    ['review', [...words].sort((a, b) => a.mastery - b.mastery)],
  ];
  for (const [bucket, list] of fillers) {
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
    const words = listWords(userId);
    const sel = buildPlanSelection(words, user.daily_goal);
    plan = tx(() => {
      const id = Number(run('INSERT INTO daily_plans (user_id, plan_date) VALUES (?,?)', userId, today).lastInsertRowid);
      sel.forEach(([bucket, w], i) => {
        run('INSERT INTO daily_plan_items (plan_id, user_vocabulary_id, bucket, position) VALUES (?,?,?,?)', id, w.uv_id, bucket, i);
      });
      return get('SELECT * FROM daily_plans WHERE id=?', id);
    });
  }
  return planView(userId, plan);
}

/** Add another batch of words to today's plan ("Study more"). */
export function extendTodayPlan(userId, count = 5) {
  const current = getTodayPlan(userId);
  const taken = new Set(current.items.map((i) => i.uv_id));
  const words = listWords(userId);
  const sel = buildPlanSelection(words, count, taken);
  const start = current.items.length;
  tx(() => {
    sel.forEach(([bucket, w], i) => {
      run('INSERT OR IGNORE INTO daily_plan_items (plan_id, user_vocabulary_id, bucket, position) VALUES (?,?,?,?)', current.id, w.uv_id, bucket, start + i);
    });
  });
  return getTodayPlan(userId);
}

function planView(userId, plan) {
  const items = all('SELECT * FROM daily_plan_items WHERE plan_id=? ORDER BY position', plan.id);
  const words = items.length ? listWords(userId, { ids: items.map((i) => i.user_vocabulary_id) }) : [];
  const byId = new Map(words.map((w) => [w.uv_id, w]));
  const list = items
    .filter((i) => byId.has(i.user_vocabulary_id))
    .map((i) => ({ ...byId.get(i.user_vocabulary_id), bucket: i.bucket, completed: !!i.completed_at }));
  const counts = { new: 0, review: 0, difficult: 0, mistakes: 0 };
  for (const i of list) counts[i.bucket] += 1;
  return {
    id: plan.id,
    date: plan.plan_date,
    items: list,
    counts,
    total: list.length,
    completed: list.filter((i) => i.completed).length,
  };
}

/* -------------------------------------------------------------- stats */

export function streak(userId) {
  const days = all(
    `SELECT DISTINCT date(created_at, 'localtime') AS d FROM review_logs WHERE user_id=? ORDER BY d DESC LIMIT 400`,
    userId,
  ).map((r) => r.d);
  const set = new Set(days);
  const cursor = new Date();
  // Today not studied yet doesn't break the streak until the day is over.
  if (!set.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (set.has(localDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  let best = 0;
  let run_ = 0;
  let prev = null;
  for (const d of [...days].reverse()) {
    if (prev) {
      const p = new Date(`${prev}T12:00:00`);
      p.setDate(p.getDate() + 1);
      run_ = localDate(p) === d ? run_ + 1 : 1;
    } else run_ = 1;
    best = Math.max(best, run_);
    prev = d;
  }
  return { current: count, best, studied_today: set.has(localDate()) };
}

export function stats(userId = DEFAULT_USER_ID) {
  const words = listWords(userId);
  const today = localDate();
  const todayLogs = get(
    `SELECT COUNT(*) AS n, SUM(correct) AS c FROM review_logs WHERE user_id=? AND date(created_at,'localtime') = ?`,
    userId,
    today,
  );
  const plan = getTodayPlan(userId);
  return {
    total: words.length,
    new: words.filter((w) => w.status === 'new').length,
    learning: words.filter((w) => w.status === 'learning').length,
    mastered: words.filter((w) => w.status === 'mastered').length,
    due: words.filter((w) => w.due).length,
    difficult: words.filter((w) => w.difficult).length,
    saved_today: words.filter((w) => w.saved_at >= dayOffset(0).toISOString()).length,
    reviews_today: todayLogs.n || 0,
    correct_today: todayLogs.c || 0,
    plan: { total: plan.total, completed: plan.completed, counts: plan.counts },
    streak: streak(userId),
    videos: get('SELECT COUNT(*) AS n FROM videos').n,
  };
}

export function progress(userId = DEFAULT_USER_ID, days = 30) {
  const start = dayOffset(days - 1).toISOString();
  const logs = all(
    `SELECT date(created_at,'localtime') AS d, COUNT(*) AS n, SUM(correct) AS c
     FROM review_logs WHERE user_id=? AND created_at >= ? GROUP BY d`,
    userId,
    start,
  );
  const saved = all(
    `SELECT date(saved_at,'localtime') AS d, COUNT(*) AS n FROM user_vocabulary
     WHERE user_id=? AND state='saved' AND saved_at >= ? GROUP BY d`,
    userId,
    start,
  );
  const logMap = new Map(logs.map((l) => [l.d, l]));
  const savedMap = new Map(saved.map((s) => [s.d, s.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = localDate(dayOffset(i));
    const l = logMap.get(d);
    series.push({ date: d, reviews: l?.n || 0, correct: l?.c || 0, saved: savedMap.get(d) || 0 });
  }
  const words = listWords(userId);
  const levels = { B1: 0, B2: 0, C1: 0 };
  for (const w of words) levels[w.level] += 1;
  const totals = get(`SELECT COUNT(*) AS n, SUM(correct) AS c FROM review_logs WHERE user_id=?`, userId);
  const bySource = all(
    `SELECT source, COUNT(*) AS n, SUM(correct) AS c FROM review_logs WHERE user_id=? GROUP BY source ORDER BY n DESC`,
    userId,
  );
  return {
    series,
    levels,
    status: {
      new: words.filter((w) => w.status === 'new').length,
      learning: words.filter((w) => w.status === 'learning').length,
      mastered: words.filter((w) => w.status === 'mastered').length,
    },
    accuracy: totals.n ? Math.round((100 * totals.c) / totals.n) : 0,
    total_reviews: totals.n,
    by_source: bySource,
    hardest: words
      .filter((w) => w.wrong_count > 0)
      .sort((a, b) => b.wrong_count - a.wrong_count || a.mastery - b.mastery)
      .slice(0, 8),
    streak: streak(userId),
  };
}

/* ----------------------------------------------------------- campaigns */

export function listCampaigns(userId = DEFAULT_USER_ID) {
  const camps = all('SELECT * FROM campaigns WHERE user_id=? ORDER BY created_at DESC', userId);
  return camps.map((c) => campaignSummary(userId, c));
}

function campaignSummary(userId, c) {
  const words = listWords(userId, { campaign_id: c.id });
  const completed = words.filter((w) => w.status === 'mastered' || w.mastery >= 60).length;
  return {
    ...c,
    total: words.length,
    completed,
    remaining: words.length - completed,
    due: words.filter((w) => w.due).length,
    new: words.filter((w) => w.status === 'new').length,
    progress: words.length ? Math.round((100 * completed) / words.length) : 0,
    avg_mastery: words.length ? Math.round(words.reduce((s, w) => s + w.mastery, 0) / words.length) : 0,
    levels: ['B1', 'B2', 'C1'].map((l) => words.filter((w) => w.level === l).length),
  };
}

export function getCampaign(userId, id) {
  const c = get('SELECT * FROM campaigns WHERE id=? AND user_id=?', id, userId);
  if (!c) throw httpError(404, 'Campaign not found');
  return { ...campaignSummary(userId, c), words: listWords(userId, { campaign_id: id }) };
}

/**
 * Create a campaign. source_type:
 *  - video / videos: words from the given video ids (optionally saving every
 *    recommended item of those videos first)
 *  - selection: explicit user_vocabulary ids
 *  - topic: saved words tagged with the topic
 */
export function createCampaign(userId, input) {
  const { name, description, source_type, video_ids = [], uv_ids = [], topic, include_unsaved, color } = input;
  if (!name?.trim()) throw httpError(400, 'Campaign name is required');
  return tx(() => {
    let ids = [];
    let ref = null;
    if (source_type === 'video' || source_type === 'videos') {
      if (!video_ids.length) throw httpError(400, 'Choose at least one video');
      ref = video_ids.join(',');
      for (const vid of video_ids) {
        if (include_unsaved) {
          const vvs = all(
            `SELECT vv.id FROM video_vocabulary vv
             LEFT JOIN user_vocabulary uv ON uv.vocabulary_id = vv.vocabulary_id AND uv.user_id = ?
             WHERE vv.video_id = ? AND (uv.id IS NULL OR uv.state = 'saved')`,
            userId,
            vid,
          );
          for (const vv of vvs) saveWord(userId, vv.id);
        }
        ids.push(...all(`SELECT id FROM user_vocabulary WHERE user_id=? AND state='saved' AND source_video_id=?`, userId, vid).map((r) => r.id));
      }
    } else if (source_type === 'selection') {
      if (!uv_ids.length) throw httpError(400, 'Select at least one word');
      ids = uv_ids.map(Number);
    } else if (source_type === 'topic') {
      if (!topic) throw httpError(400, 'Choose a topic');
      ref = topic;
      ids = all(
        `SELECT uv.id FROM user_vocabulary uv JOIN vocabulary v ON v.id = uv.vocabulary_id
         WHERE uv.user_id=? AND uv.state='saved' AND v.topic = ?`,
        userId,
        topic,
      ).map((r) => r.id);
    } else {
      throw httpError(400, 'Unknown campaign source');
    }
    if (!ids.length) throw httpError(400, 'No saved words match this source yet');
    const id = Number(
      run(
        'INSERT INTO campaigns (user_id, name, description, source_type, source_ref, color) VALUES (?,?,?,?,?,?)',
        userId, name.trim(), description || null, source_type, ref, color || null,
      ).lastInsertRowid,
    );
    for (const uvId of new Set(ids)) {
      run('INSERT OR IGNORE INTO campaign_items (campaign_id, user_vocabulary_id) VALUES (?,?)', id, uvId);
    }
    return id;
  });
}

export function deleteCampaign(userId, id) {
  run('DELETE FROM campaigns WHERE id=? AND user_id=?', id, userId);
}

export function topics(userId = DEFAULT_USER_ID) {
  return all(
    `SELECT v.topic AS topic, COUNT(*) AS n FROM user_vocabulary uv JOIN vocabulary v ON v.id = uv.vocabulary_id
     WHERE uv.user_id=? AND uv.state='saved' AND v.topic IS NOT NULL GROUP BY v.topic ORDER BY n DESC`,
    userId,
  );
}

/* --------------------------------------------------------------- games */

/** Word pool for games. scope: today|yesterday|week|previous|difficult|review|all|mixed|campaign */
export function gamePool(userId, scope = 'mixed', campaignId) {
  if (campaignId) return listWords(userId, { campaign_id: campaignId });
  if (scope === 'today') {
    const plan = getTodayPlan(userId);
    const savedToday = listWords(userId, { section: 'today' });
    const map = new Map([...plan.items, ...savedToday].map((w) => [w.uv_id, w]));
    return [...map.values()];
  }
  if (scope === 'mixed') {
    // Spread across today / yesterday / this week / older / difficult.
    const all_ = listWords(userId);
    const plan = getTodayPlan(userId);
    const groups = [
      plan.items,
      listWords(userId, { section: 'yesterday' }),
      listWords(userId, { section: 'week' }),
      listWords(userId, { section: 'previous' }),
      all_.filter((w) => w.difficult),
    ];
    const seen = new Set();
    const out = [];
    let added = true;
    while (out.length < 24 && added) {
      added = false;
      for (const g of groups) {
        const w = g.find((x) => !seen.has(x.uv_id));
        if (w) {
          seen.add(w.uv_id);
          out.push(w);
          added = true;
        }
      }
    }
    return out;
  }
  return listWords(userId, { section: scope });
}

/* -------------------------------------------------------------- utils */

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
