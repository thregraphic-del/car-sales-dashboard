// 🔒 The paid AI features (the full video summary and the periodic recaps) are OFF by default and exist only for the owner,
// who switches them on from the settings when really needed. For everyone else they do not exist: the pages do not show them
// and the server refuses the requests — so nothing can be spent on them.
import { config } from '../config.js';
import { get, run } from '../db/index.js';
import { httpError } from './errors.js';

export const FEATURES = ['summary', 'recap'];
const key = (userId) => `paid:${userId}`;
/** The owner: the admin account (or the single local learner when the app has no login). */
export const isOwner = (req) => req.user?.role === 'admin' || !config.auth.required;
const OFF = () => ({ summary: false, recap: false });

export async function paidFor(req) {
  if (!isOwner(req)) return OFF();
  try {
    const v = JSON.parse((await get('SELECT value FROM app_settings WHERE key = ?', key(req.userId)))?.value || '{}');
    return { summary: v.summary === true, recap: v.recap === true };
  } catch { return OFF(); }
}

export async function setPaid(req, patch) {
  if (!isOwner(req)) throw httpError(403, 'هذا الإعداد لصاحب الموقع فقط.');
  const now = await paidFor(req);
  for (const f of FEATURES) if (typeof patch?.[f] === 'boolean') now[f] = patch[f];
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key(req.userId), JSON.stringify(now));
  return now;
}

export async function requirePaid(req, name) {
  if (!(await paidFor(req))[name]) throw httpError(403, 'هذه الميزة غير مفعّلة.');
}
