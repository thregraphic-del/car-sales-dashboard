// /api/sources — YouTube videos and texts: analysis, reader view, AI chunks.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, idParam, str } from '../http.js';
import { httpError } from '../lib/errors.js';
import { TranscriptError } from '../lib/youtube.js';
import * as service from '../services/sources.js';
import * as sources from '../data/sources.js';

const router = Router();
const MAX_TRANSCRIPT = config.limits.importTextChars;

router.post('/youtube', wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.url !== 'string' || !b.url.trim()) throw httpError(400, 'الصق رابط فيديو يوتيوب.');
  if (b.transcript && String(b.transcript).length > MAX_TRANSCRIPT) throw httpError(413, 'النص طويل جدًا. قسّمه إلى أجزاء أصغر.');
  try {
    const origin = `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
    return await service.analyzeYoutube({ url: str(b.url, 500), transcript: b.transcript ? String(b.transcript) : '', force: Boolean(b.force), origin }, req.userId);
  } catch (err) {
    if (err instanceof TranscriptError) {
      // details: which attempts failed and why (no secrets) — shown under "تفاصيل" for troubleshooting.
      res.status(err.status).json({ error: err.message, code: err.code, video: err.meta, details: (err.details || []).slice(0, 12) });
      return undefined;
    }
    throw err;
  }
}));

router.post('/text', wrap(async (req) => {
  const text = String(req.body?.text || '');
  if (!text.trim()) throw httpError(400, 'الصق نصًا أولًا.');
  if (text.length > MAX_TRANSCRIPT) throw httpError(413, 'النص طويل جدًا. قسّمه إلى أجزاء أصغر.');
  return service.analyzeText(text, req.userId, str(req.body?.title, 200));
}));

router.get('/', wrap(async (req) => sources.listSources(req.userId)));
router.get('/:id', wrap(async (req) => sources.sourceView(idParam(req), req.userId)));
router.delete('/:id', wrap(async (req) => {
  await sources.deleteSource(idParam(req), req.userId);
  return { ok: true };
}));

// AI improvement, one short chunk per request (the reader calls again until done).
router.post('/:id/refine', wrap(async (req) => service.refineSource(idParam(req), req.userId)));
router.get('/:id/translation', wrap(async (req) => service.translationStatus(idParam(req), req.userId)));
router.post('/:id/translation', wrap(async (req) => service.translateSource(idParam(req), req.userId)));

export default router;
