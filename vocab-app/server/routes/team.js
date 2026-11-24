// /api/team — «انضم لفريقنا»: join, see your code and how many signed up with it, ask for a payout.
import { Router } from 'express';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { isGuest } from '../lib/guest.js';
import { emailOf, phoneOf } from '../services/recovery.js';
import { memberOfUser, join, summary, requestPayout, ackPayouts } from '../data/team.js';

const router = Router();

router.get('/me', wrap(async (req) => {
  const m = await memberOfUser(req.userId);
  return { member: m ? await summary(m) : null };
}));

router.post('/join', wrap(async (req) => {
  if (isGuest(req.user)) throw httpError(403, 'سجّل حسابًا أولًا ثم انضم للفريق.');
  // automatic: everything comes from the account (name, and email / phone when saved)
  const b = req.body || {};
  const [email, phone] = await Promise.all([emailOf(req.userId), phoneOf(req.userId)]);
  const m = await join(req.userId, { name: b.name || req.user?.name || req.user?.username || 'عضو', email: b.email || email || '', phone: b.phone || phone || '' });
  return { ok: true, member: await summary(m) };
}));

router.post('/payout', wrap(async (req) => {
  const m = await memberOfUser(req.userId);
  if (!m) throw httpError(404, 'انضم للفريق أولًا.');
  return { ok: true, member: await requestPayout(m) };
}));

// the member has seen the answer (paid / declined)
router.post('/ack', wrap(async (req) => {
  const m = await memberOfUser(req.userId);
  if (m) await ackPayouts(m);
  return { ok: true };
}));

export default router;
