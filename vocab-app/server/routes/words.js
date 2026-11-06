// /api/lookup, /api/words, /api/export — clicked words and the learner's words.
import { wordClusters } from '../data/clusters.js';
import { simplifyUserWords } from '../data/simplest.js';
import { Router } from 'express';
import { wrap, num, idParam, idList, str, oneOf } from '../http.js';
import { httpError } from '../lib/errors.js';
import { lookup } from '../services/lookup.js';
import * as words from '../data/words.js';
import { groupIdsFor, setWordGroups } from '../data/groups.js';
import { exportRows, toCsv, XLSX_COLUMNS } from '../data/export.js';
import { recordView } from '../data/goal.js';
import { toXlsx } from '../lib/xlsx.js';

const router = Router();
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

router.get('/lookup', wrap(async (req) => {
  const word = str(req.query.word, 80);
  const lineId = num(req.query.line_id);
  const vocabularyId = num(req.query.vocabulary_id);
  if (!word && !vocabularyId) throw httpError(400, 'لا توجد كلمة.');
  const r = await lookup({ line_id: lineId, word, vocabulary_id: vocabularyId, context: req.query.context === '1' }, req.userId);
  // A word opened while watching or reading counts toward today's goal.
  if (r.found && lineId && r.vocabulary_id) r.goal = await recordView(req.userId, r.vocabulary_id);
  return r;
}));

/** Save a word. Body: {vocabulary_id, occurrence_id?, group_ids?} */
router.post('/words', wrap(async (req) => {
  const b = req.body || {};
  const vocabularyId = num(b.vocabulary_id);
  if (!vocabularyId) throw httpError(400, 'لا توجد كلمة للحفظ.');
  const out = await words.saveWord(req.userId, vocabularyId, { occurrenceId: num(b.occurrence_id) ?? null, groupIds: idList(b.group_ids, 50) });
  // Saving one word counts toward today's goal; "save all" (bulk) does not.
  const goal = b.bulk ? undefined : await recordView(req.userId, vocabularyId);
  return { ...out, groups: await groupIdsFor(out.uv_id), goal };
}));
/** Save many words at once (the reader's "save all"); does not count toward the daily goal. */
router.post('/words/bulk', wrap(async (req) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 800) : [];
  let saved = 0;
  for (const it of items) {
    const vid = num(it?.vocabulary_id);
    if (!vid) continue;
    await words.saveWord(req.userId, vid, { occurrenceId: num(it.occurrence_id) ?? null });
    saved += 1;
  }
  return { saved };
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
// Words whose level was never checked get it once (the video being opened, or «كلماتي»).
router.post('/levels', wrap(async (req) => {
  const { aiAvailable } = await import('../services/ai.js');
  if (!aiAvailable()) return { levelled: 0, more: false };
  const { all } = await import('../db/index.js');
  const { ensureLevels } = await import('../services/dictionary.js');
  const sourceId = num(req.body?.source_id);
  const ids = sourceId
    ? (await all('SELECT DISTINCT o.vocabulary_id AS id FROM occurrences o JOIN sources s ON s.id = o.source_id WHERE o.source_id = ? AND s.user_id = ? AND o.suggested = 1', sourceId, req.userId)).map((r) => r.id)
    : (await all("SELECT vocabulary_id AS id FROM user_vocabulary WHERE user_id = ? AND state = 'saved'", req.userId)).map((r) => r.id);
  try {
    return await ensureLevels(ids);
  } catch (err) {
    if (err?.name === 'AiError' || err?.constructor?.name === 'AiError') return { levelled: 0, more: false };
    throw err;
  }
}));
router.get('/words/clusters', wrap(async (req) => ({ clusters: await wordClusters(req.userId) })));
router.post('/words/simplify', wrap(async (req) => simplifyUserWords(req.userId)));
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
  if (q.format !== 'csv') {
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition', `attachment; filename="lexitube-words-${stamp}.xlsx"`)
      .send(toXlsx(rows, XLSX_COLUMNS, 'كلماتي', { countLabel: 'عدد الكلمات (يتغيّر مع الفلتر)' }));
    return undefined;
  }
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="lexitube-words-${stamp}.csv"`).send(toCsv(rows));
  return undefined;
}));

export default router;
