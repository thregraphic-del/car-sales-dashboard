// /api/groups — learner-named groups (many-to-many with words).
import { Router } from 'express';
import { wrap, idParam, idList, str } from '../http.js';
import * as groups from '../data/groups.js';
import { listGroups } from '../data/learning.js';

const router = Router();
const COLOR = /^[a-z]{3,12}$/;

router.get('/', wrap(async (req) => listGroups(req.userId)));
router.post('/', wrap(async (req) => groups.createGroup(req.userId, str(req.body?.name, 100), COLOR.test(req.body?.color || '') ? req.body.color : null)));
router.patch('/:id', wrap(async (req) => groups.renameGroup(req.userId, idParam(req), str(req.body?.name, 100))));
router.delete('/:id', wrap(async (req) => {
  await groups.deleteGroup(req.userId, idParam(req));
  return { ok: true };
}));
router.post('/:id/words', wrap(async (req) => {
  await groups.addToGroup(req.userId, idParam(req), idList(req.body?.uv_ids));
  return { ok: true };
}));
router.delete('/:id/words', wrap(async (req) => {
  await groups.removeFromGroup(req.userId, idParam(req), idList(req.body?.uv_ids));
  return { ok: true };
}));

export default router;
