// /api/lookup, /api/words, /api/export — clicked words and the learner's words.
import { Router } from 'express';
import { wrap, num, idParam, idList, str, oneOf } from '../http.js';
import { httpError } from '../lib/errors.js';
import { lookup } from '../services/lookup.js';
import * as words from '../data/words.js';
import { groupIdsFor, setWordGroups } from '../data/groups.js';
import { exportRows, toCsv } from '../data/export.js';

const router = Router();
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

router.get('/lookup', wrap(async (req) => {
  const word = str(req.query.word, 80);
  const lineId = num(req.query.line_id);
  const vocabularyId = num(req.query.vocabulary_id);
  if (!word && !vocabularyId) throw httpError(400, 'لا توجد كلمة.');
  return lookup({ line_id: lineId, word, vocabulary_id: vocabularyId, context: req.query.context === '1' }, req.userId);
}));

/** Save a word. Body: {vocabulary_id, occurrence_id?, group_ids?} */
router.post('/words', wrap(async (req) => {
  const b = req.body || {};
  const vocabularyId = num(b.vocabulary_id);
  if (!vocabularyId) throw httpError(400, 'لا توجد كلمة للحفظ.');
  const out = await words.saveWord(req.userId, vocabularyId, { occurrenceId: num(b.occurrence_id) ?? null, groupIds: idList(b.group_ids, 50) });
  return { ...out, groups: await groupIdsFor(out.uv_id) };
}));
router.post('/words/dismiss', wrap(async (req) => {
  const id = num(req.body?.vocabulary_id);
  if (!id) throw httpError(400, 'لا توجد كلمة.');
  await words.dismissWord(req.userId, id);
  return { ok: true };
}));
router.post('/words/reset', wrap(async (req) => {
  const id = num(req.body?.vocabulary_id);
  if (!id) throw httpError(400, 'لا توجد كلمة.');
  await words.resetVocabularyState(req.userId, id);
  return { ok: true };
}));
router.post('/words/delete', wrap(async (req) => ({ deleted: await words.unsaveWords(req.userId, idList(req.body?.uv_ids)) })));

router.get('/words', wrap(async (req) => {
  const q = req.query;
  return words.listWords(req.userId, {
    q: str(q.q, 80),
    level: oneOf(q.level, LEVELS, undefined),
    status: oneOf(q.status, ['new', 'learning', 'mastered', 'due', 'difficult'], undefined),
    group_id: num(q.group_id),
    source_id: num(q.source_id),
    section: oneOf(q.section, ['today', 'yesterday', 'week', 'month', 'previous'], undefined),
    from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : undefined,
    ids: q.ids ? idList(q.ids) : undefined,
  });
}));
router.get('/words/:id', wrap(async (req) => words.getWord(req.userId, idParam(req))));
router.patch('/words/:id', wrap(async (req) => {
  const b = req.body || {};
  return words.updateWord(req.userId, idParam(req), {
    user_arabic: b.user_arabic === undefined ? undefined : str(b.user_arabic ?? '', 200),
    example: str(b.example, 400),
    example_arabic: str(b.example_arabic, 400),
  });
}));
router.put('/words/:id/groups', wrap(async (req) => ({ group_ids: await setWordGroups(req.userId, idParam(req), idList(req.body?.group_ids, 50)) })));
router.delete('/words/:id', wrap(async (req) => {
  await words.unsaveWord(req.userId, idParam(req));
  return { ok: true };
}));

router.get('/export', wrap(async (req, res) => {
  const q = req.query;
  const rows = await exportRows(req.userId, {
    range: oneOf(q.range, ['all', '3m', 'month', 'week', 'custom'], 'all'),
    from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : undefined,
    group_id: num(q.group_id),
    level: oneOf(q.level, LEVELS, undefined),
    difficult: q.difficult,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  if (q.format === 'json') {
    res.set('Content-Disposition', `attachment; filename="lexitube-words-${stamp}.json"`);
    return { exported_at: new Date().toISOString(), count: rows.length, words: rows };
  }
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="lexitube-words-${stamp}.csv"`).send(toCsv(rows));
  return undefined;
}));

export default router;
