// /api/data — backups, importing a local LexiTube database, demo data.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, idParam } from '../http.js';
import { httpError } from '../lib/errors.js';
import * as backup from '../data/backup.js';
import { seedDemo, resetDemo, hasLearningData } from '../data/demo.js';

const router = Router();

router.get('/summary', wrap(async () => ({ counts: await backup.counts(), backups: await backup.listBackups() })));

/** Download everything as one JSON file. */
router.get('/backup', wrap(async (_req, res) => {
  const snap = await backup.snapshot();
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="lexitube-backup-${stamp}.json"`);
  return snap;
}));

router.post('/backups', wrap(async () => backup.storeBackup('manual')));
router.get('/backups/:id', wrap(async (req, res) => {
  const payload = await backup.getBackup(idParam(req));
  res.set('Content-Type', 'application/json; charset=utf-8').set('Content-Disposition', `attachment; filename="lexitube-server-backup-${req.params.id}.json"`).send(payload);
  return undefined;
}));

// Import = replace (after an automatic backup): begin → rows (chunks) → finish.
router.post('/import/begin', wrap(async (req) => {
  if (req.body?.confirm !== 'REPLACE') throw httpError(400, 'يلزم تأكيد الاستبدال.');
  return backup.beginImport(req.userId, req.body?.profile || {});
}));
router.post('/import/rows', wrap(async (req) => {
  const { table, rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length > config.limits.importChunkRows) throw httpError(413, 'دفعة كبيرة جدًا.');
  return { inserted: await backup.importRows(req.userId, String(table), rows) };
}));
router.post('/import/finish', wrap(async () => ({ counts: await backup.finishImport() })));

/** Demo data: only into an empty account (never over real data). */
router.post('/demo', wrap(async (req) => {
  if (await hasLearningData()) throw httpError(409, 'عندك بيانات بالفعل — لن نضيف بيانات تجريبية فوقها.');
  return seedDemo(req.userId);
}));

/** Local development only: wipe and reload the demo. */
router.post('/reset-demo', wrap(async (req) => {
  if (!config.features.demoReset) throw httpError(404, 'غير موجود');
  return resetDemo(req.userId);
}));

export default router;
