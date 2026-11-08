// /api/sources — YouTube videos and texts: analysis, reader view, AI chunks.
import { simplifySourceWords, simplestFor } from '../data/simplest.js';
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
    if (err.pending) {
      // a long video: its transcript is still being prepared — the page asks again shortly
      res.status(202).json({ pending: true, message: 'فيديو طويل — نجهّز نصّه، لحظات…' });
      return undefined;
    }
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
// A short recap in Saudi dialect of the part just watched (from–to seconds).
router.post('/:id/index-step', wrap(async (req) => sources.indexStep(idParam(req), req.userId)));
router.post('/:id/retranslate', wrap(async (req) => sources.retranslate(idParam(req), req.userId)));

router.post('/:id/recap', wrap(async (req, res) => {
  const id = idParam(req);
  const src = await sources.getSource(id, req.userId);
  if (!src) throw httpError(404, 'المصدر غير موجود.');
  const from = Math.max(0, Number(req.body?.from) || 0);
  const to = Math.max(from + 30, Number(req.body?.to) || from + 300);
  const lines = (await sources.sourceLines(id)).filter((l) => l.start_seconds != null && l.start_seconds >= from - 1 && l.start_seconds < to);
  if (lines.length < 3) return { ok: false };
  try {
    const { recapWithAi } = await import('../services/extractor.js');
    return { ok: true, text: await recapWithAi({ title: src.title, text: lines.map((l) => l.text).join(' ') }) };
  } catch (err) {
    if (err?.name !== 'AiError' && err?.constructor?.name !== 'AiError') throw err;
    return { ok: false, error: err.message };
  }
}));
router.post('/:id/repair-translation', wrap(async (req) => service.repairTranslation(idParam(req), req.userId)));
router.post('/:id/translation', wrap(async (req) => service.translateSource(idParam(req), req.userId)));

router.post('/:id/align', wrap(async (req) => service.alignSource(idParam(req), req.userId, req.body?.from, req.body?.skip)));

router.post('/:id/summary', wrap(async (req, res) => {
  const id = idParam(req);
  const src = await sources.getSource(id, req.userId);
  if (!src) throw httpError(404, 'المصدر غير موجود.');
  const lines = await sources.sourceLines(id);
  const { summaryWithAi } = await import('../services/extractor.js');
  const { AiError } = await import('../services/ai.js');
  try {
    return { ok: true, ...(await summaryWithAi({ title: src.title, text: lines.map((l) => l.text).join(' ') })) };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message });
    return undefined;
  }
}));

router.post('/:id/dictionary-words', wrap(async (req) => {
  const id = idParam(req);
  const src = await sources.getSource(id, req.userId);
  if (!src) throw httpError(404, 'المصدر غير موجود.');
  if (req.body?.dry && Array.isArray(req.body.words)) {
    const { findVocabulary } = await import('../data/vocabulary.js');
    const out = {};
    for (const w of req.body.words.slice(0, 20)) {
      const trace = [];
      const v = await findVocabulary(String(w));
      out[w] = { result: v ? (await simplestFor(v, trace))?.term || null : 'no vocab', trace };
    }
    return out;
  }
  if (req.body?.dry) return simplifySourceWords(id, { dry: true });
  const t0 = Date.now();
  const r = src.dict_words_at ? { added: 0 } : await sources.addDictionaryWords(id);
  // a few seconds of simplifying per call; the reader calls again while "more" is true
  const s = await simplifySourceWords(id, { budgetMs: Math.max(3000, 16000 - (Date.now() - t0)) });
  return { ...r, ...s };
}));

router.put('/:id/progress', wrap(async (req) => {
  const id = idParam(req);
  const seconds = Number(req.body?.seconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) throw httpError(400, 'وقت غير صالح.');
  if (!(await sources.getSource(id, req.userId))) throw httpError(404, 'المصدر غير موجود.');
  await sources.setProgress(id, req.userId, Math.round(seconds * 10) / 10);
  return { ok: true };
}));

export default router;
