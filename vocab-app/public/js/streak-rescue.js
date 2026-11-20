// 🔥 The flame went out (yesterday was missed): say so in simple words, and give yesterday back when today's goal is doubled.
// The goal is counted on the device (goal.js); the server only records the day that was given back.
import { api } from './api.js';
import { state } from './state.js';
import { toast } from './ui.js';
import { dayStr, progress } from './goal.js';

const KEY = 'streak.pending';
const TOLD = 'streak.told';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };

export const pendingRescue = () => { try { const p = JSON.parse(read(KEY) || 'null'); return p && p.day === dayStr() ? p : null; } catch { return null; } };

/** Remember (for today) that yesterday can still be given back. */
export function setPending(streak) {
  write(KEY, streak?.rescue ? JSON.stringify({ day: dayStr(), lost: streak.rescue.lost }) : null);
}

/** Today's goal doubled: what is needed and how far the learner is. For a combined goal EVERY part is doubled. */
export function doubleInfo() {
  const p = progress();
  const parts = p.items.map((i) => ({ ...i, target: i.n * 2, pct2: Math.min(100, Math.round((100 * i.count) / (i.n * 2))) }));
  if (!p.combo) {
    const i = parts[0];
    return { ...p, target: i.target, left: Math.max(0, i.target - i.count), pct: i.pct2, line: `هدفك ${i.n} ${i.unit} — المطلوب اليوم ${i.target}`, ask: `${i.target} ${i.unit} بدل ${i.n}`, parts };
  }
  const doneN = parts.filter((i) => i.count >= i.target).length;
  const names = parts.map((i) => `${i.target} ${i.unit}`).join(' + ');
  return { ...p, count: doneN, n: parts.length, target: parts.length, unit: 'هدف', left: parts.length - doneN, pct: Math.round(parts.reduce((a, i) => a + i.pct2, 0) / parts.length), line: `أهدافك مضاعفة: ${names}`, ask: `كل أهدافك مضاعفة (${names})`, parts };
}

let healing = false;
/** If the flame is out and today's goal is doubled → yesterday counts as if it was not missed. */
export async function checkDouble() {
  if (healing || !pendingRescue()) return false;
  const d = doubleInfo();
  if (d.count < d.target) return false;
  healing = true;
  try {
    const st = await api.rescueStreak(true);
    setPending(st);
    if (state.stats) state.stats.streak = st;
    toast(`🔥 رجعت شعلتك — أمس كأنه ما فاتك (${st.current} ${st.current === 1 ? 'يوم' : 'أيام'} متتالية)`);
    window.dispatchEvent(new CustomEvent('lexitube:streak-back', { detail: st }));
    return true;
  } catch { return false; } finally { healing = false; }
}

/** One short note a day, wherever the learner opens the site. */
export function remindOnce(streak) {
  if (!streak?.rescue || read(TOLD) === dayStr()) return;
  write(TOLD, dayStr());
  if (/^#\/(today)?$|^$|^#\/today/.test(location.hash)) return; // the home page already shows the full notice
  const d = doubleInfo();
  toast(`🔥 شعلتك طفت — بس عادي! ضاعف هدف اليوم (${d.ask}) وأمس يتصحح كأنه ما فاتك.`, 7000);
}
