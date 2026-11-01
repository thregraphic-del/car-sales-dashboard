// /api/feedback — "اقتراحاتكم": send a suggestion; the administrator reads them.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { addFeedback, listFeedback } from '../data/feedback.js';

const router = Router();
const recent = new Map(); // simple per-user rate limit

router.post('/', wrap(async (req) => {
  const message = String(req.body?.message || '').trim().slice(0, 2000);
  if (message.length < 3) throw httpError(400, 'اكتب اقتراحك أولًا.');
  const contact = String(req.body?.contact || '').trim().slice(0, 120) || null;
  const page = String(req.body?.page || '').trim().slice(0, 120) || null;
  const last = recent.get(req.userId) || [];
  const now = Date.now();
  const window = last.filter((t) => now - t < 3600000);
  if (window.length >= 10) throw httpError(429, 'أرسلت اقتراحات كثيرة الآن — شكرًا لك! حاول بعد قليل.');
  recent.set(req.userId, [...window, now]);
  const id = await addFeedback(req.userId, { message, contact, page });
  return { ok: true, id };
}));

router.get('/', wrap(async (req) => ({
  admin: req.user?.role === 'admin' || !config.auth.required,
  items: await listFeedback(req.userId, { admin: req.user?.role === 'admin' || !config.auth.required }),
})));

export default router;
