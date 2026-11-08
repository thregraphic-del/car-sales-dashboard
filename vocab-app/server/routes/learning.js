// /api/today, /api/stats, /api/practice, /api/review — the daily learning loop.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, num, idList, oneOf } from '../http.js';
import { httpError } from '../lib/errors.js';
import { GRADES } from '../lib/srs.js';
import * as learning from '../data/learning.js';
import { listWords } from '../data/words.js';
import { all } from '../db/index.js';

const router = Router();

router.get('/today', wrap(async (req) => {
  const words = await listWords(req.userId);
  const [plan, stats] = [await learning.getTodayPlan(req.userId, words), await learning.stats(req.userId)];
  const { viewsToday } = await import('../data/goal.js');
  return { plan, stats, watch_goal: await viewsToday(req.userId) };
}));
router.post('/today/extend', wrap(async (req) => learning.extendTodayPlan(req.userId, Math.max(1, Math.min(20, num(req.body?.count) || 5)))));
router.get('/stats', wrap(async (req) => learning.stats(req.userId)));

// 📅 Every day since the start: answers (right/wrong), words saved, words seen — from the saved logs.
router.get('/calendar', wrap(async (req) => {
  const u = req.userId;
  const rev = await all('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n, SUM(correct) AS ok FROM review_logs WHERE user_id = ? GROUP BY substr(created_at, 1, 10)', u);
  const sav = await all("SELECT substr(saved_at, 1, 10) AS d, COUNT(*) AS n FROM user_vocabulary WHERE user_id = ? AND saved_at IS NOT NULL AND state = 'saved' GROUP BY substr(saved_at, 1, 10)", u);
  const seen = await all('SELECT day AS d, COUNT(*) AS n FROM word_views WHERE user_id = ? GROUP BY day', u);
  const days = {};
  const put = (d, k, v) => { if (!d) return; (days[d] ||= { answers: 0, right: 0, saved: 0, seen: 0 })[k] = Number(v || 0); };
  for (const r of rev) { put(r.d, 'answers', r.n); put(r.d, 'right', r.ok); }
  for (const r of sav) put(r.d, 'saved', r.n);
  for (const r of seen) put(r.d, 'seen', r.n);
  const user = await all('SELECT daily_goal FROM users WHERE id = ?', u);
  return { days, goal: Number(user[0]?.daily_goal || 10) };
}));

router.get('/practice', wrap(async (req) => learning.practiceSet(req.userId, {
  ids: req.query.ids ? idList(req.query.ids, 1000) : undefined,
  exact: req.query.exact === '1',
  group_id: num(req.query.group_id),
  source_id: num(req.query.source_id),
  vids: req.query.vids ? idList(req.query.vids, 1000) : undefined,
  seen: req.query.seen ? idList(req.query.seen, 2000) : undefined,
  focus: oneOf(req.query.focus, ['smart', 'difficult', 'due', 'new'], 'smart'),
  size: Math.max(1, Math.min(config.limits.practiceMax, num(req.query.size) || 10)),
})));

const REVIEW_SOURCE = /^(flashcard|today|listening|quiz|game:[a-z0-9-]{1,40})$/;
router.post('/review', wrap(async (req) => {
  const { uv_id: uvId, grade, source } = req.body || {};
  if (!GRADES.includes(grade)) throw httpError(400, 'grade must be hard, good or easy');
  const id = num(uvId);
  if (!id) throw httpError(400, 'لا توجد كلمة.');
  return learning.recordReview(req.userId, id, grade, typeof source === 'string' && REVIEW_SOURCE.test(source) ? source : 'flashcard');
}));

export default router;
