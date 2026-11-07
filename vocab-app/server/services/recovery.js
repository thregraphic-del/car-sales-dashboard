// 🔐 Email on the account + «نسيت كلمة المرور»: a 6-digit code by email, valid 15 minutes,
// 5 tries. Stored as small values in app_settings (no new tables).
import crypto from 'node:crypto';
import { get, run } from '../db/index.js';
import { httpError } from '../lib/errors.js';
import { findByUsername, getUser, setCredentials } from '../data/users.js';
import { hashPassword } from './auth.js';
import { sendMail, mailConfigured } from './mail.js';

const set = (k, v) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, v);
const val = async (k) => (await get('SELECT value FROM app_settings WHERE key = ?', k))?.value ?? null;
const del = (k) => run('DELETE FROM app_settings WHERE key = ?', k);
const norm = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const emailOf = (userId) => val(`email:${userId}`);

export async function setEmail(userId, email) {
  const e = norm(email);
  if (!e) {
    const old = await emailOf(userId);
    if (old) await del(`email-user:${old}`);
    await del(`email:${userId}`);
    return null;
  }
  if (!validEmail(e)) throw httpError(400, 'الإيميل غير صحيح.');
  const owner = await val(`email-user:${e}`);
  if (owner && Number(owner) !== userId) throw httpError(409, 'هذا الإيميل مستخدم في حساب آخر.');
  const old = await emailOf(userId);
  if (old && old !== e) await del(`email-user:${old}`);
  await set(`email:${userId}`, e);
  await set(`email-user:${e}`, String(userId));
  return e;
}

async function userFor(login) {
  const l = norm(login).replace(/^@/, '');
  if (!l) return null;
  if (l.includes('@')) {
    const id = await val(`email-user:${l}`);
    if (id) return getUser(Number(id));
  }
  return findByUsername(l);
}

export async function sendResetCode(login) {
  if (!mailConfigured()) throw httpError(503, 'إرسال الإيميل غير مفعّل بعد.');
  const user = await userFor(login);
  const email = user ? await emailOf(user.id) : null;
  // the same answer either way: nobody can probe which accounts exist
  if (!user || !email) return { ok: true };
  const prev = await val(`reset:${user.id}`);
  if (prev) { try { if (Date.now() - JSON.parse(prev).at < 60000) throw httpError(429, 'انتظر دقيقة ثم اطلب كودًا جديدًا.'); } catch (err) { if (err.status) throw err; } }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await set(`reset:${user.id}`, JSON.stringify({ h: sha(`${user.id}:${code}`), exp: Date.now() + 15 * 60000, tries: 0, at: Date.now() }));
  await sendMail({
    to: email,
    subject: `3Goal — كود استرجاع الحساب: ${code}`,
    text: `كود استرجاع حسابك في 3Goal: ${code}\nصالح لمدة ١٥ دقيقة. إذا ما طلبته تجاهل هذه الرسالة.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px"><p>كود استرجاع حسابك في <b>3Goal</b>:</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold">${code}</p><p>صالح لمدة ١٥ دقيقة. إذا ما طلبته تجاهل هذه الرسالة.</p></div>`,
  });
  return { ok: true };
}

export async function resetWithCode(login, code, password) {
  const user = await userFor(login);
  const raw = user ? await val(`reset:${user.id}`) : null;
  const r = raw ? JSON.parse(raw) : null;
  if (!r || Date.now() > r.exp || r.tries >= 5) throw httpError(400, 'الكود انتهى أو غير صحيح — اطلب كودًا جديدًا.');
  if (sha(`${user.id}:${String(code || '').trim()}`) !== r.h) {
    r.tries += 1;
    await set(`reset:${user.id}`, JSON.stringify(r));
    throw httpError(400, 'الكود غير صحيح.');
  }
  const p = String(password || '');
  if (!p || p.length > 200) throw httpError(400, 'اكتب كلمة مرور جديدة.');
  await setCredentials(user.id, user.username, await hashPassword(p));
  await del(`reset:${user.id}`);
  return getUser(user.id);
}
