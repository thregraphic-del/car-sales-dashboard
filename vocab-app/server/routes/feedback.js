// /api/feedback — "اقتراحاتكم": send a suggestion; the administrator reads them.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { addFeedback, listFeedback } from '../data/feedback.js';
import { sendMail, mailConfigured } from '../services/mail.js';

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
  if (window.length >= 10) throw httpError(429, 'أرسلت اقتراحات كثيرة الحين — شكرًا لك! حاول بعد شوي.');
  recent.set(req.userId, [...window, now]);
  const id = await addFeedback(req.userId, { message, contact, page });
  await emailOwner({ message, contact, page, user: req.user });
  return { ok: true, id };
}));

router.get('/', wrap(async (req) => ({
  admin: req.user?.role === 'admin' || !config.auth.required,
  items: await listFeedback(req.userId, { admin: req.user?.role === 'admin' || !config.auth.required }),
})));

/** 📩 A copy of each suggestion goes to the owner's inbox (GMAIL_USER). Never blocks or fails the request. */
async function emailOwner({ message, contact, page, user }) {
  if (!mailConfigured()) return;
  const who = user?.username || user?.name || (user?.id ? `#${user.id}` : 'زائر');
  const lines = [`💡 اقتراح جديد في 3Goal`, '', message, '', `المرسل: ${who}`, `الصفحة: ${page || '—'}`];
  if (contact) lines.push(`للتواصل: ${contact}`);
  try {
    await Promise.race([
      sendMail({ to: process.env.GMAIL_USER, subject: `💡 اقتراح من ${who}`, text: lines.join('\n') }),
      new Promise((_, no) => setTimeout(() => no(new Error('mail timeout')), 8000)),
    ]);
  } catch (e) {
    console.warn('feedback email failed:', e.message);
  }
}

export default router;
