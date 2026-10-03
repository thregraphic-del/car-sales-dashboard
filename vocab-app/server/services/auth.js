// Owner-only access for the public website.
//
// - The site has one learner (the owner). The first account is created with
//   SETUP_CODE (a secret environment variable); after that sign-up is closed.
// - Passwords are hashed with scrypt; sessions are HMAC-signed HttpOnly
//   cookies (SESSION_SECRET). Changing the password invalidates old sessions.
// - Locally, without SESSION_SECRET, there is no login (single local user).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { httpError } from '../lib/errors.js';
import { DEFAULT_USER_ID, ensureUser, getUser, findByUsername, setCredentials, ownerExists } from '../data/users.js';
import { getOrCreateSetting } from '../data/settings.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(password, Buffer.from(salt, 'base64'), 32, SCRYPT);
  const expected = Buffer.from(hash, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}

const sameSecret = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

const b64 = (s) => Buffer.from(s).toString('base64url');
let signingKey = null;
async function key() {
  if (!signingKey) signingKey = config.auth.sessionSecret || await getOrCreateSetting('session_secret', () => crypto.randomBytes(48).toString('base64url'));
  return signingKey;
}
const sign = async (data) => crypto.createHmac('sha256', await key()).update(data).digest('base64url');
const fingerprint = (hash) => crypto.createHash('sha256').update(String(hash)).digest('base64url').slice(0, 12);

export async function createSessionToken(user) {
  const payload = b64(JSON.stringify({ uid: user.id, fp: fingerprint(user.password_hash), exp: Date.now() + config.auth.sessionDays * 86400000 }));
  return `${payload}.${await sign(payload)}`;
}

/** The user of a valid session token, or null. */
export async function userFromToken(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!data.uid || data.exp < Date.now()) return null;
  const user = await getUser(data.uid);
  if (!user?.password_hash || fingerprint(user.password_hash) !== data.fp) return null;
  return user;
}

// Slow down password guessing (per server instance; scrypt adds cost too).
const failures = new Map();
function checkRate(key) {
  const f = failures.get(key);
  if (f && f.count >= 5 && Date.now() - f.at < 15 * 60000) throw httpError(429, 'محاولات كثيرة. انتظر ربع ساعة ثم حاول مرة أخرى.');
}
function noteFailure(key) {
  const f = failures.get(key) || { count: 0, at: 0 };
  failures.set(key, { count: Date.now() - f.at > 15 * 60000 ? 1 : f.count + 1, at: Date.now() });
  if (failures.size > 1000) failures.clear();
}

function validCredentials(username, password) {
  const u = String(username || '').trim();
  const p = String(password || '');
  if (!/^[\p{L}\p{N}._@-]{3,40}$/u.test(u)) throw httpError(400, 'اسم المستخدم: من 3 إلى 40 حرفًا أو رقمًا بدون مسافات.');
  if (p.length < 10 || p.length > 200) throw httpError(400, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
  return { u, p };
}

export async function status(user) {
  return {
    required: config.auth.required,
    owner_exists: config.auth.required ? await ownerExists() : true,
    logged_in: !config.auth.required || Boolean(user),
    setup_available: config.auth.required && Boolean(config.auth.setupCode),
  };
}

/** First visit: create the owner account with the setup code. */
export async function setup({ setup_code: code, username, password }, ip) {
  if (!config.auth.required) throw httpError(400, 'تسجيل الدخول غير مطلوب في النسخة المحلية.');
  if (await ownerExists()) throw httpError(403, 'الحساب موجود بالفعل. سجّل الدخول.');
  checkRate(`setup:${ip}`);
  if (!config.auth.setupCode || !sameSecret(code || '', config.auth.setupCode)) {
    noteFailure(`setup:${ip}`);
    throw httpError(401, 'رمز الإعداد غير صحيح.');
  }
  const { u, p } = validCredentials(username, password);
  await setCredentials(DEFAULT_USER_ID, u, await hashPassword(p));
  return ensureUser(DEFAULT_USER_ID);
}

export async function login({ username, password }, ip) {
  const key = `login:${ip}`;
  checkRate(key);
  const user = username ? await findByUsername(String(username).trim()) : null;
  const ok = user?.password_hash ? await verifyPassword(String(password || ''), user.password_hash) : (await hashPassword('x'), false);
  if (!ok) {
    noteFailure(key);
    throw httpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
  }
  failures.delete(key);
  return user;
}

export async function changePassword(user, { current, password }) {
  if (!await verifyPassword(String(current || ''), user.password_hash)) throw httpError(401, 'كلمة المرور الحالية غير صحيحة.');
  const { p } = validCredentials(user.username, password);
  await setCredentials(user.id, user.username, await hashPassword(p));
  return ensureUser(user.id);
}
