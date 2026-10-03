// /api/today, /api/stats, /api/practice, /api/review — the daily learning loop.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, num, idList, oneOf } from '../http.js';
import { httpError } from '../lib/errors.js';
import { GRADES } from '../lib/srs.js';
import * as learning from '../data/learning.js';
import { listWords } from '../data/words.js';

const router = Router();

router.get('/today', wrap(async (req) => {
  const words = await listWords(req.userId);
  const [plan, stats] = [await learning.getTodayPlan(req.userId, words), await learning.stats(req.userId)];
  return { plan, stats };
}));
router.post('/today/extend', wrap(async (req) => learning.extendTodayPlan(req.userId, Math.max(1, Math.min(20, num(req.body?.count) || 5)))));
router.get('/stats', wrap(async (req) => learning.stats(req.userId)));

router.get('/practice', wrap(async (req) => learning.practiceSet(req.userId, {
  ids: req.query.ids ? idList(req.query.ids, 200) : undefined,
  group_id: num(req.query.group_id),
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
