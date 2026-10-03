// /api/auth — owner login for the public site.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap } from '../http.js';
import * as auth from '../services/auth.js';
import { publicUser } from '../data/users.js';

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

router.post('/login', wrap(async (req, res) => {
  const user = await auth.login(req.body || {}, req.ip);
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
