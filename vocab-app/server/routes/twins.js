// /api/twins — keep the learned twin groups in «كلماتي» (only when the learner agrees).
import { Router } from 'express';
import { wrap } from '../http.js';
import { guardGuest } from '../lib/guest.js';
import { saveTwins } from '../data/twins.js';

const router = Router();

router.post('/save', wrap(async (req) => {
  const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
  await guardGuest(req.user, 'words', groups.reduce((n, g) => n + (Array.isArray(g) ? g.length : 0), 0));
  return { ok: true, ...await saveTwins(req.userId, groups) };
}));

export default router;
