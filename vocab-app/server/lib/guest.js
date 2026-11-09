// 👤 Guests: anyone can try the site without an account. A guest is a normal learner row
// (role "guest", no username / password) behind a session cookie. To protect the paid
// services (transcripts, AI) a guest adds at most GUEST_SOURCES videos/texts and saves at
// most GUEST_WORDS words; then the site asks them — kindly — to create a free account,
// and everything they did moves into it (same row).
import { get } from '../db/index.js';
import { httpError } from './errors.js';

export const GUEST_SOURCES = 2;
export const GUEST_WORDS = 10;
export const isGuest = (user) => user?.role === 'guest';

const limit = (what) => {
  const err = httpError(403, what === 'sources'
    ? `جرّبت ${GUEST_SOURCES} مقاطع كضيف 👏 — سجّل حسابك المجاني (دقيقة وحدة) عشان تضيف مقاطع أكثر، وكل اللي سويته ينتقل لحسابك.`
    : `حفظت ${GUEST_WORDS} كلمات كضيف 👏 — سجّل حسابك المجاني عشان تحفظ أكثر، وكلماتك تنتقل معك.`);
  err.code = 'guest_limit';
  return err;
};

/** Throws the friendly «سجّل» message when a guest would go past the trial. adding = how many. */
export async function guardGuest(user, kind, adding = 1) {
  if (!isGuest(user)) return;
  if (kind === 'sources') {
    const n = (await get('SELECT COUNT(*) AS n FROM sources WHERE user_id = ? AND is_demo = 0', user.id)).n;
    if (Number(n) + adding > GUEST_SOURCES) throw limit('sources');
  } else {
    const n = (await get("SELECT COUNT(*) AS n FROM user_vocabulary WHERE user_id = ? AND state = 'saved'", user.id)).n;
    if (Number(n) + adding > GUEST_WORDS) throw limit('words');
  }
}
