// The daily learning loop: answers (spaced repetition), today's plan,
// practice rounds, statistics and per-group progress.
import { all, get, run, tx } from '../db/index.js';
import { config } from '../config.js';
import { httpError } from '../lib/errors.js';
import { applyReview, isDifficult, statusOf, isDue } from '../lib/srs.js';
import { localDate, startOfDay, endOfTodayIso } from '../lib/time.js';
import { DEFAULT_USER_ID, ensureUser } from './users.js';
import { listWords } from './words.js';

/* ================================================================ reviews */

export async function recordReview(userId, uvId, grade, source = 'flashcard') {
  return tx(async () => {
    const uv = await get('SELECT * FROM user_vocabulary WHERE id = ? AND user_id = ?', uvId, userId);
    if (!uv) throw httpError(404, 'لم نجد هذه الكلمة.');
    // Game answers on words that are not due only update the learning signals.
    const isGame = source.startsWith('game:') || source === 'quiz';
    const scheduling = !isGame || uv.review_count === 0 || isDue(uv);
    const next = applyReview(uv, grade, { scheduling });
    await run(
      `UPDATE user_vocabulary SET review_count = ?, correct_count = ?, wrong_count = ?, streak_correct = ?, lapses = ?, ease = ?, interval_days = ?, mastery = ?,
         difficulty = ?, recent = ?, last_wrong_at = ?, last_reviewed_at = ?, next_review_at = ? WHERE id = ?`,
      next.review_count, next.correct_count, next.wrong_count, next.streak_correct, next.lapses, next.ease, next.interval_days, next.mastery,
      next.difficulty, next.recent, next.last_wrong_at ?? null, next.last_reviewed_at, next.next_review_at ?? null, uv.id,
    );
    await run(
      'INSERT INTO review_logs (user_id, user_vocabulary_id, source, grade, correct, interval_after, created_at) VALUES (?,?,?,?,?,?,?)',
      userId, uv.id, source, grade, grade === 'hard' ? 0 : 1, next.interval_days, next.last_reviewed_at,
    );
    const plan = await get('SELECT id FROM daily_plans WHERE user_id = ? AND plan_date = ?', userId, localDate());
    if (plan) {
      await run('UPDATE daily_plan_items SET completed_at = COALESCE(completed_at, ?) WHERE plan_id = ? AND user_vocabulary_id = ?', next.last_reviewed_at, plan.id, uv.id);
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
  const endIso = endOfTodayIso();
  const mix = config.learning.planMix;
  const byNext = (a, b) => (a.next_review_at || '').localeCompare(b.next_review_at || '');
  const difficult = words.filter((w) => w.difficult).sort((a, b) => b.difficulty - a.difficulty);
  const mistakes = words.filter((w) => recentlyWrong(w)).sort((a, b) => (b.last_wrong_at || '').localeCompare(a.last_wrong_at || ''));
  const review = words.filter((w) => w.review_count > 0 && w.next_review_at && w.next_review_at <= endIso).sort(byNext);
  const fresh = words.filter((w) => w.review_count === 0).sort((a, b) => a.saved_at.localeCompare(b.saved_at));
  const nDifficult = Math.max(1, Math.round(goal * mix.difficult));
  const nMistakes = Math.max(0, Math.round(goal * mix.mistakes));
  const nReview = Math.round(goal * mix.review);
  const nNew = Math.max(0, goal - nDifficult - nMistakes - nReview);
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
  return sel.slice(0, goal);
}

async function insertPlanItems(planId, sel, offset) {
  for (const [i, [bucket, w]] of sel.entries()) {
    await run(
      'INSERT INTO daily_plan_items (plan_id, user_vocabulary_id, bucket, position) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',
      planId, w.uv_id, bucket, offset + i,
    );
  }
}

/** Today's plan: chosen once per day (stable), then only progress changes. */
export async function getTodayPlan(userId = DEFAULT_USER_ID, words = null) {
  const today = localDate();
  let plan = await get('SELECT * FROM daily_plans WHERE user_id = ? AND plan_date = ?', userId, today);
  if (!plan) {
    const user = await ensureUser(userId);
    const sel = buildPlanSelection(words || await listWords(userId), user.daily_goal);
    plan = await tx(async () => {
      const created = await all('INSERT INTO daily_plans (user_id, plan_date) VALUES (?,?) ON CONFLICT DO NOTHING RETURNING id', userId, today);
      if (created.length) await insertPlanItems(created[0].id, sel, 0);
      return get('SELECT * FROM daily_plans WHERE user_id = ? AND plan_date = ?', userId, today);
    });
  }
  return planView(userId, plan, words);
}

export async function extendTodayPlan(userId, count = 5) {
  const current = await getTodayPlan(userId);
  const taken = new Set((await all('SELECT user_vocabulary_id FROM daily_plan_items WHERE plan_id = ?', current.id)).map((r) => r.user_vocabulary_id));
  const sel = buildPlanSelection(await listWords(userId), count, taken);
  const max = (await get('SELECT MAX(position) AS m FROM daily_plan_items WHERE plan_id = ?', current.id))?.m ?? -1;
  await tx(() => insertPlanItems(current.id, sel, max + 1));
  return getTodayPlan(userId);
}

async function planView(userId, plan, words = null) {
  const items = await all('SELECT * FROM daily_plan_items WHERE plan_id = ? ORDER BY position', plan.id);
  const ids = items.map((i) => i.user_vocabulary_id);
  const list0 = !ids.length ? [] : words ? words.filter((w) => ids.includes(w.uv_id)) : await listWords(userId, { ids });
  const byId = new Map(list0.map((w) => [w.uv_id, w]));
  const list = items.filter((i) => byId.has(i.user_vocabulary_id)).map((i) => ({ ...byId.get(i.user_vocabulary_id), bucket: i.bucket, completed: !!i.completed_at }));
  const counts = { new: 0, review: 0, difficult: 0, mistakes: 0 };
  for (const i of list) counts[i.bucket] = (counts[i.bucket] || 0) + 1;
  return { id: plan.id, date: plan.plan_date, items: list, counts, total: list.length, completed: list.filter((i) => i.completed).length };
}

/* =============================================================== practice */

/**
 * Words for a practice round, most-needed first.
 *  - ids: replay exactly these (e.g. the words just missed) + a few support words
 *  - group_id: words of one group
 *  - focus 'difficult' | 'due' | 'new' | 'smart' (default)
 */
export async function practiceSet(userId, { ids, group_id, focus = 'smart', size = 10 } = {}) {
  const everything = await listWords(userId);
  const now = Date.now();
  const need = (w) => {
    let s = 0;
    if (recentlyWrong(w, 1)) {
      // Missed in the last 24h: more urgent than "due"; the fresher, the sooner.
      const hours = (now - new Date(w.last_wrong_at).getTime()) / 3600000;
      s += 140 + 30 * Math.max(0, 1 - hours / 24);
    } else if (w.due) {
      s += 40 + Math.min(30, (now - new Date(w.next_review_at).getTime()) / 86400000);
    }
    s += 50 * (w.difficulty || 0);
    if (w.review_count === 0) s += 25;
    s += (100 - w.mastery) / 10;
    return s;
  };
  if (ids?.length) {
    const order = new Map(ids.map((id, i) => [Number(id), i]));
    let words = everything.filter((w) => order.has(w.uv_id)).sort((a, b) => order.get(a.uv_id) - order.get(b.uv_id));
    // Support words so a round never feels empty: the weakest other words.
    const minRound = config.learning.replayMinRound;
    if (words.length < minRound) {
      const support = everything.filter((w) => !order.has(w.uv_id)).sort((a, b) => need(b) - need(a)).slice(0, minRound - words.length);
      words = [...words, ...support.map((w) => ({ ...w, support: true }))];
    }
    return { words, distractors: everything };
  }
  let pool = everything;
  if (group_id) pool = pool.filter((w) => w.group_ids.includes(Number(group_id)));
  if (focus === 'difficult') pool = pool.filter((w) => w.difficult || recentlyWrong(w));
  if (focus === 'due') pool = pool.filter((w) => w.due);
  if (focus === 'new') pool = pool.filter((w) => w.review_count === 0);
  const words = [...pool].sort((a, b) => need(b) - need(a)).slice(0, size);
  return { words, distractors: everything };
}

/* ================================================================== stats */

/** Consecutive study days (in the learner's calendar), ending today or yesterday. */
export async function streak(userId) {
  const since = startOfDay(400).toISOString();
  const rows = await all('SELECT created_at FROM review_logs WHERE user_id = ? AND created_at >= ?', userId, since);
  const days = new Set(rows.map((r) => localDate(new Date(r.created_at))));
  const today = localDate();
  let n = days.has(today) ? 0 : 1;
  let count = 0;
  while (days.has(localDate(startOfDay(n)))) {
    count += 1;
    n += 1;
  }
  return { current: count, studied_today: days.has(today) };
}

export async function stats(userId = DEFAULT_USER_ID) {
  const words = await listWords(userId);
  const plan = await getTodayPlan(userId, words);
  const todayStart = startOfDay(0).toISOString();
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
    saved_today: words.filter((w) => w.saved_at >= todayStart).length,
    plan: { total: plan.total, completed: plan.completed, counts: plan.counts },
    attention,
    streak: await streak(userId),
  };
}

/* ================================================================= groups */

export async function listGroups(userId = DEFAULT_USER_ID) {
  const groups = await all('SELECT * FROM word_groups WHERE user_id = ? ORDER BY lower(name), id', userId);
  if (!groups.length) return [];
  const words = await listWords(userId);
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
