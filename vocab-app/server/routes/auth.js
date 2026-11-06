// /api/auth — accounts for the website: register, login, logout, password.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap } from '../http.js';
import * as auth from '../services/auth.js';
import { publicUser } from '../data/users.js';
import { setEmail, emailOf, sendResetCode, resetWithCode } from '../services/recovery.js';

const router = Router();

function setCookie(res, value, maxAgeSeconds) {
  const parts = [`${config.auth.cookieName}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (config.app.production) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
const startSession = async (res, user) => setCookie(res, await auth.createSessionToken(user), config.auth.sessionDays * 86400);

router.get('/status', wrap(async (req) => ({ ...await auth.status(req.user), user: publicUser(req.user) })));

router.post('/setup', wrap(async (req, res) => {
  const user = await auth.setup(req.body || {}, req.ip);
  await startSession(res, user);
  return { ok: true, user: publicUser(user) };
}));

router.post('/register', wrap(async (req, res) => {
  const user = await auth.register(req.body || {}, req.ip);
  if (req.body?.email) await setEmail(user.id, req.body.email).catch(() => {});
  await startSession(res, user);
  return { ok: true, user: publicUser(user) };
}));

router.post('/login', wrap(async (req, res) => {
  const user = await auth.login(req.body || {}, req.ip);
  await startSession(res, user);
  return { ok: true, user: publicUser(user) };
}));

// ✉️ the account's email (for password reset codes)
router.get('/email', wrap(async (req, res) => (req.user ? { email: await emailOf(req.user.id) } : res.status(401).json({ error: 'سجّل الدخول أولًا.', code: 'auth' }))));
router.post('/email', wrap(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'سجّل الدخول أولًا.', code: 'auth' });
  return { ok: true, email: await setEmail(req.user.id, req.body?.email) };
}));
// «نسيت كلمة المرور»: a code by email, then a new password
router.post('/forgot', wrap(async (req) => sendResetCode(req.body?.login)));
router.post('/reset', wrap(async (req, res) => {
  const user = await resetWithCode(req.body?.login, req.body?.code, req.body?.password);
  await startSession(res, user);
  return { ok: true, user: publicUser(user) };
}));

router.post('/logout', wrap(async (_req, res) => {
  setCookie(res, '', 0);
  return { ok: true };
}));

router.post('/password', wrap(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'سجّل الدخول أولًا.', code: 'auth' });
  const user = await auth.changePassword(req.user, req.body || {});
  await startSession(res, user);
  return { ok: true };
}));

export default router;
