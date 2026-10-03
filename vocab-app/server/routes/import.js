// /api/import — the "Add" box: preview, optional AI completion, save.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, idList } from '../http.js';
import { httpError } from '../lib/errors.js';
import * as importer from '../services/import-words.js';

const router = Router();

router.post('/preview', wrap(async (req) => {
  const text = String(req.body?.text || '');
  if (!text.trim()) throw httpError(400, 'الصق كلمات أو نصًا أولًا.');
  if (text.length > config.limits.importTextChars) throw httpError(413, 'النص طويل جدًا. قسّمه إلى أجزاء أصغر.');
  return importer.preview(text, req.userId);
}));

router.post('/enrich', wrap(async (req) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) throw httpError(400, 'items must be an array');
  return importer.enrich(items.slice(0, importer.ENRICH_BATCH));
}));

router.post('/save', wrap(async (req) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) throw httpError(400, 'items must be an array');
  if (items.length > config.limits.importItems) throw httpError(413, `احفظ ${config.limits.importItems} كلمة في كل مرة على الأكثر.`);
  return { results: await importer.save(items, { groupIds: idList(req.body?.group_ids, 50) }, req.userId) };
}));

export default router;
