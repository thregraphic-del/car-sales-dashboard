// /api/ai — AI status and "explain this" for a selected phrase or sentence.
// The OpenRouter key stays on the server; only the selected text and its own
// sentence are sent (never the whole transcript).
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, num } from '../http.js';
import { httpError } from '../lib/errors.js';
import { aiStatus, checkModel, usageToday, AiError } from '../services/ai.js';
import { explainWithAi } from '../services/extractor.js';
import { getLine, getSource } from '../data/sources.js';

const router = Router();

router.get('/status', wrap(async (req) => {
  await checkModel();
  return { ...aiStatus(), used_today: await usageToday(req.userId) };
}));

router.post('/explain', wrap(async (req, res) => {
  const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw httpError(400, 'حدّد كلمة أو جملة أولًا.');
  if (text.length > config.ai.explainMaxChars) throw httpError(413, `حدّد نصًا أقصر (حتى ${config.ai.explainMaxChars} حرف).`);
  const lineId = num(req.body?.line_id);
  const line = lineId ? await getLine(lineId, req.userId) : null; // only the learner's own transcripts
  const source = line ? await getSource(line.source_id, req.userId) : null;
  try {
    const r = await explainWithAi({ text, sentence: line?.text || '', title: source?.title || '' });
    return { ok: true, text, line_id: line?.id || null, ...r };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message, ai: aiStatus() });
    return undefined;
  }
}));

export default router;
