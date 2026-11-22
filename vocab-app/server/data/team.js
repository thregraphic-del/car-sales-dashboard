// «انضم لفريقنا»: team members, their referral code, who signed up with it, what they earned and their payout requests.
// Money is kept in halalas (1 riyal = 100) and the site never moves money: a member asks for a payout, the owner
// approves it in her panel, sends the transfer from her own bank, and marks it paid. Nothing runs in the background.
import crypto from 'node:crypto';
import { all, get, run, insert } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { normPhone } from './users.js';

const SETTINGS_KEY = 'team:settings';
const nowIso = () => new Date().toISOString();
const toInt = (v) => Math.max(0, Math.round(Number(v) || 0));

export const DEFAULTS = {
  commission: { mode: 'fixed', value: 0 }, // 'fixed' riyals per subscriber, or 'percent' of the subscription price
  min_payout: 100, // riyals
  contact: { email: '', phone: '', whatsapp: '', instagram: '', tiktok: '' },
  pricing: [], // [{ name, price, period, note }] — edited by the owner
};

export async function getSettings() {
  let v = {};
  try { v = JSON.parse((await get('SELECT value FROM app_settings WHERE key = ?', SETTINGS_KEY))?.value || '{}'); } catch { /* defaults */ }
  return {
    commission: { ...DEFAULTS.commission, ...(v.commission || {}) },
    min_payout: Number.isFinite(v.min_payout) ? v.min_payout : DEFAULTS.min_payout,
    contact: { ...DEFAULTS.contact, ...(v.contact || {}) },
    pricing: Array.isArray(v.pricing) ? v.pricing : [],
  };
}

const clean = (s, n) => String(s ?? '').trim().slice(0, n);
/** «@name», «name» or a full profile link → just the account name. */
const handleOf = (v) => {
  let t = clean(v, 200);
  try { if (/^https?:\/\//i.test(t)) t = new URL(t).pathname.split('/').filter(Boolean)[0] || ''; } catch { t = ''; }
  return t.replace(/^@+/, '').replace(/[^\w.]/g, '').slice(0, 40);
};

export async function saveSettings(patch = {}) {
  const cur = await getSettings();
  if (patch.commission) {
    const mode = patch.commission.mode === 'percent' ? 'percent' : 'fixed';
    const value = Math.max(0, Math.min(mode === 'percent' ? 100 : 100000, Number(patch.commission.value) || 0));
    cur.commission = { mode, value };
  }
  if (patch.min_payout !== undefined) cur.min_payout = Math.max(1, Math.min(100000, Number(patch.min_payout) || DEFAULTS.min_payout));
  if (patch.contact) {
    const c = patch.contact;
    const digits = (v, n) => String(v ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '').slice(0, n);
    cur.contact = {
      email: clean(c.email, 120),
      phone: digits(c.phone, 16),
      whatsapp: digits(c.whatsapp, 16),
      instagram: handleOf(c.instagram),
      tiktok: handleOf(c.tiktok),
    };
  }
  if (Array.isArray(patch.pricing)) {
    cur.pricing = patch.pricing.slice(0, 12).map((p) => ({ name: clean(p.name, 40), price: Math.max(0, Number(p.price) || 0), period: clean(p.period, 20), note: clean(p.note, 120) })).filter((p) => p.name);
  }
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', SETTINGS_KEY, JSON.stringify(cur));
  return cur;
}

/** What every visitor may see: how to reach the owner. */
export async function publicContact() {
  const { contact } = await getSettings();
  return {
    email: contact.email || '', phone: contact.phone || '', whatsapp: contact.whatsapp || '',
    instagram: contact.instagram || '', tiktok: contact.tiktok || '',
  };
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// a short code: 3 characters (31³ ≈ 29,000 codes), unique per member; if the short ones ever run low a longer one is made
const makeCode = (len = 3) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('');

export const memberOfUser = (userId) => get('SELECT * FROM team_members WHERE user_id = ?', userId);

export async function join(userId, { name, email, phone }) {
  if (await memberOfUser(userId)) throw httpError(409, 'أنت عضو في الفريق من قبل.');
  const n = clean(name, 60);
  const e = clean(email, 120).toLowerCase();
  const p = normPhone(phone);
  if (n.length < 2) throw httpError(400, 'اكتب اسمك.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw httpError(400, 'اكتب إيميلًا صحيحًا.');
  if (!p) throw httpError(400, 'اكتب رقم جوال صحيحًا.');
  for (let i = 0; i < 60; i += 1) {
    try {
      await insert('INSERT INTO team_members (user_id, name, email, phone, code, created_at) VALUES (?,?,?,?,?,?)', userId, n, e, p, makeCode(i < 40 ? 3 : 4), nowIso());
      return memberOfUser(userId);
    } catch (err) {
      if (!/unique|duplicate/i.test(err.message)) throw err;
      if (await memberOfUser(userId)) throw httpError(409, 'أنت عضو في الفريق من قبل.');
    }
  }
  throw httpError(500, 'ما قدرنا نجهّز الكود، حاول مرة ثانية.');
}

/** Someone just signed up with a code: count them for its owner (once; never for yourself). */
export async function noteReferral(newUserId, code) {
  const c = clean(code, 20).toUpperCase();
  if (!c) return false;
  const m = await get('SELECT id, user_id FROM team_members WHERE code = ?', c);
  if (!m || m.user_id === newUserId) return false;
  await run('INSERT INTO referrals (member_id, referred_user_id, created_at) VALUES (?,?,?) ON CONFLICT (referred_user_id) DO NOTHING', m.id, newUserId, nowIso());
  return true;
}

async function money(memberId) {
  const earned = toInt((await get('SELECT COALESCE(SUM(amount_cents),0) AS s FROM team_credits WHERE member_id = ?', memberId)).s);
  const rows = await all('SELECT status, COALESCE(SUM(amount_cents),0) AS s FROM payout_requests WHERE member_id = ? GROUP BY status', memberId);
  const by = Object.fromEntries(rows.map((r) => [r.status, toInt(r.s)]));
  const paid = by.paid || 0;
  const pending = by.pending || 0;
  return { earned, paid, pending, available: Math.max(0, earned - paid - pending) };
}

export async function summary(member) {
  const st = await getSettings();
  const m = await money(member.id);
  const referrals = toInt((await get('SELECT COUNT(*) AS c FROM referrals WHERE member_id = ?', member.id)).c);
  const recent = await all(`SELECT u.name AS name, r.created_at AS at FROM referrals r JOIN users u ON u.id = r.referred_user_id WHERE r.member_id = ? ORDER BY r.id DESC LIMIT 15`, member.id);
  const requests = await all('SELECT id, amount_cents, status, note, seen, created_at, decided_at FROM payout_requests WHERE member_id = ? ORDER BY id DESC LIMIT 10', member.id);
  const min = Math.round(st.min_payout * 100);
  return {
    code: member.code, name: member.name, email: member.email, phone: member.phone, joined: member.created_at,
    referrals, recent: recent.map((r) => ({ name: String(r.name || '').split(' ')[0], at: r.at })),
    ...m, min_payout_cents: min, can_request: m.available >= min && m.available > 0,
    requests,
  };
}

export async function requestPayout(member) {
  const st = await getSettings();
  const { available } = await money(member.id);
  const min = Math.round(st.min_payout * 100);
  if (available < min || available <= 0) throw httpError(400, `أقل مبلغ للتحويل ${st.min_payout} ريال.`);
  await insert('INSERT INTO payout_requests (member_id, amount_cents, status, created_at) VALUES (?,?,?,?)', member.id, available, 'pending', nowIso());
  return summary(member);
}

export async function ackPayouts(member) {
  await run("UPDATE payout_requests SET seen = 1 WHERE member_id = ? AND status IN ('paid','rejected')", member.id);
}

/* ------------------------------------------------------------------ owner */

const day = (d = new Date()) => d.toISOString().slice(0, 10);

export async function overview() {
  const today = day();
  const month = today.slice(0, 7);
  const week = day(new Date(Date.now() - 7 * 86400000));
  const one = async (sql, ...p) => toInt((await get(sql, ...p)).c);
  const users = {
    total: await one("SELECT COUNT(*) AS c FROM users WHERE role <> 'guest'"),
    guests: await one("SELECT COUNT(*) AS c FROM users WHERE role = 'guest'"),
    new7: await one("SELECT COUNT(*) AS c FROM users WHERE role <> 'guest' AND substr(created_at,1,10) >= ?", week),
  };
  const content = {
    sources: await one('SELECT COUNT(*) AS c FROM sources'),
    saved_words: await one('SELECT COUNT(*) AS c FROM user_vocabulary'),
  };
  const f = (r) => Number(r?.s || 0);
  const ai = {
    today: f(await get('SELECT COALESCE(SUM(cost),0) AS s FROM ai_cost_items WHERE day = ?', today)),
    month: f(await get('SELECT COALESCE(SUM(cost),0) AS s FROM ai_cost_items WHERE day LIKE ?', `${month}%`)),
    by_task: (await all('SELECT task, COUNT(*) AS calls, COALESCE(SUM(cost),0) AS cost FROM ai_cost_items WHERE day LIKE ? GROUP BY task ORDER BY cost DESC', `${month}%`)).map((r) => ({ task: r.task, calls: toInt(r.calls), cost: Number(r.cost) })),
    daily: (await all('SELECT day, COALESCE(SUM(cost),0) AS cost FROM ai_cost_items WHERE day >= ? GROUP BY day ORDER BY day', day(new Date(Date.now() - 13 * 86400000)))).map((r) => ({ day: r.day, cost: Number(r.cost) })),
  };
  const team = {
    members: await one('SELECT COUNT(*) AS c FROM team_members'),
    referrals: await one('SELECT COUNT(*) AS c FROM referrals'),
    pending_requests: await one("SELECT COUNT(*) AS c FROM payout_requests WHERE status = 'pending'"),
    pending_cents: toInt((await get("SELECT COALESCE(SUM(amount_cents),0) AS c FROM payout_requests WHERE status = 'pending'")).c),
    paid_cents: toInt((await get("SELECT COALESCE(SUM(amount_cents),0) AS c FROM payout_requests WHERE status = 'paid'")).c),
  };
  return { users, content, ai, team };
}

export async function listUsers(limit = 200) {
  const rows = await all(`SELECT u.id, u.name, u.username, u.role, u.created_at,
      (SELECT COUNT(*) FROM user_vocabulary v WHERE v.user_id = u.id) AS words,
      (SELECT COUNT(*) FROM sources s WHERE s.user_id = u.id) AS sources,
      (SELECT COALESCE(SUM(c.cost),0) FROM ai_cost_items c WHERE c.user_id = u.id AND c.day LIKE ?) AS ai_month
    FROM users u ORDER BY u.id DESC LIMIT ?`, `${day().slice(0, 7)}%`, Math.min(500, limit));
  return rows.map((r) => ({ id: r.id, name: r.name, username: r.username, role: r.role, created_at: r.created_at, words: toInt(r.words), sources: toInt(r.sources), ai_month: Number(r.ai_month) }));
}

export async function listTeam() {
  const members = await all('SELECT * FROM team_members ORDER BY id DESC');
  const out = [];
  for (const m of members) {
    const mo = await money(m.id);
    out.push({ id: m.id, name: m.name, email: m.email, phone: m.phone, code: m.code, joined: m.created_at, referrals: toInt((await get('SELECT COUNT(*) AS c FROM referrals WHERE member_id = ?', m.id)).c), ...mo });
  }
  return out;
}

export async function addCredit(memberId, riyals, note) {
  const m = await get('SELECT id FROM team_members WHERE id = ?', memberId);
  if (!m) throw httpError(404, 'ما لقينا العضو.');
  const cents = Math.round(Number(riyals) * 100);
  if (!Number.isFinite(cents) || cents === 0 || Math.abs(cents) > 10_000_000) throw httpError(400, 'اكتب مبلغًا صحيحًا.');
  await insert('INSERT INTO team_credits (member_id, amount_cents, note, created_at) VALUES (?,?,?,?)', memberId, cents, clean(note, 120) || null, nowIso());
  return money(memberId);
}

export async function listPayouts() {
  const rows = await all(`SELECT p.id, p.member_id, p.amount_cents, p.status, p.note, p.created_at, p.decided_at, m.name, m.email, m.phone, m.code
    FROM payout_requests p JOIN team_members m ON m.id = p.member_id ORDER BY (p.status = 'pending') DESC, p.id DESC LIMIT 100`);
  return rows.map((r) => ({ ...r, amount_cents: toInt(r.amount_cents) }));
}

export async function decidePayout(id, action, note) {
  const p = await get('SELECT * FROM payout_requests WHERE id = ?', id);
  if (!p) throw httpError(404, 'ما لقينا الطلب.');
  if (p.status !== 'pending') throw httpError(409, 'هذا الطلب تم التعامل معه.');
  const status = action === 'paid' ? 'paid' : action === 'reject' ? 'rejected' : '';
  if (!status) throw httpError(400, 'إجراء غير معروف.');
  await run('UPDATE payout_requests SET status = ?, note = ?, decided_at = ?, seen = 0 WHERE id = ?', status, clean(note, 160) || null, nowIso(), id);
  return listPayouts();
}
