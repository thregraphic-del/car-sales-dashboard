// 👥 Friends, challenges, a weekly leaderboard and a public "my progress" link.
// Stored as small JSON values in app_settings (no new tables). Nothing runs in the
// background: everything is read when someone opens the page.
import { Router } from 'express';
import crypto from 'node:crypto';
import { wrap, str } from '../http.js';
import { httpError } from '../lib/errors.js';
import { get, run } from '../db/index.js';
import { findByUsername, getUser } from '../data/users.js';
import { listWords } from '../data/words.js';
import { streak } from '../data/learning.js';
import { startOfDay } from '../lib/time.js';

const router = Router();

async function kvGet(key, fallback) {
  const r = await get('SELECT value FROM app_settings WHERE key = ?', key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
const kvSet = (key, v) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(v));

const nameOf = (u) => (u?.name && u.name !== 'Learner' ? u.name : u?.username || 'متعلّم');

/** This week's points: correct answers + words saved (last 7 days). */
async function weekPoints(userId) {
  const from = startOfDay(6).toISOString();
  const r = await get('SELECT COUNT(*) AS n, SUM(correct) AS ok FROM review_logs WHERE user_id = ? AND created_at >= ?', userId, from);
  const s = await get("SELECT COUNT(*) AS n FROM user_vocabulary WHERE user_id = ? AND saved_at >= ? AND state <> 'known'", userId, from);
  return { correct: Number(r?.ok || 0), saved: Number(s?.n || 0), points: Number(r?.ok || 0) + 2 * Number(s?.n || 0) };
}

async function progressOf(userId) {
  const words = await listWords(userId);
  const st = await streak(userId);
  return {
    total: words.length,
    mastered: words.filter((w) => w.status === 'mastered').length,
    streak: st.current,
    week: await weekPoints(userId),
  };
}

/* ------------------------------------------------------------- my card */
const BGS = ['teal', 'sunset', 'ocean', 'forest', 'violet', 'gold', 'rose', 'night'];
router.get('/me', wrap(async (req) => {
  const u = await getUser(req.userId);
  const p = await kvGet(`profile:${req.userId}`, {});
  return { name: nameOf(u), username: u?.username || null, bg: BGS.includes(p.bg) ? p.bg : 'teal', backgrounds: BGS };
}));
router.post('/me', wrap(async (req) => {
  const bg = String(req.body?.bg || '');
  const p = await kvGet(`profile:${req.userId}`, {});
  if (BGS.includes(bg)) p.bg = bg;
  await kvSet(`profile:${req.userId}`, p);
  const name = str(req.body?.name, 40).trim();
  if (name) await run('UPDATE users SET name = ? WHERE id = ?', name, req.userId);
  return { ok: true };
}));

/* ------------------------------------------------------------- friends */
router.get('/friends', wrap(async (req) => {
  const ids = await kvGet(`friends:${req.userId}`, []);
  const rows = [];
  for (const id of [req.userId, ...ids]) {
    const u = await getUser(id);
    if (!u) continue;
    rows.push({ id, name: nameOf(u), username: u.username || null, bg: (await kvGet(`profile:${id}`, {})).bg || 'teal', me: id === req.userId, ...(await weekPoints(id)) });
  }
  rows.sort((a, b) => b.points - a.points);
  return { friends: rows };
}));

router.post('/friends', wrap(async (req) => {
  const username = str(req.body?.username, 60).replace(/^@/, '').trim();
  if (!username) throw httpError(400, 'اكتب اسم المستخدم.');
  const u = await findByUsername(username);
  if (!u) throw httpError(404, 'ما لقينا مستخدم بهذا الاسم.');
  if (u.id === req.userId) throw httpError(400, 'هذا حسابك 🙂');
  for (const [a, b] of [[req.userId, u.id], [u.id, req.userId]]) {
    const list = await kvGet(`friends:${a}`, []);
    if (!list.includes(b)) await kvSet(`friends:${a}`, [...list, b].slice(-50));
  }
  return { ok: true, friend: { id: u.id, name: nameOf(u) } };
}));

router.delete('/friends/:id', wrap(async (req) => {
  const id = Number(req.params.id);
  const list = await kvGet(`friends:${req.userId}`, []);
  await kvSet(`friends:${req.userId}`, list.filter((x) => x !== id));
  return { ok: true };
}));

/* ---------------------------------------------------------- challenges */
// A challenge = the same 10 words for both players; each plays when they like.
router.post('/challenges', wrap(async (req) => {
  const to = Number(req.body?.to);
  const friends = await kvGet(`friends:${req.userId}`, []);
  if (!friends.includes(to)) throw httpError(400, 'أضف صديقك أولًا.');
  const words = (await listWords(req.userId)).filter((w) => w.arabic || w.user_arabic).sort(() => Math.random() - 0.5).slice(0, 10)
    .map((w) => ({ term: w.term, arabic: (w.user_arabic || w.arabic || '').slice(0, 80), sentence: (w.context_sentence || '').slice(0, 200) }));
  if (words.length < 4) throw httpError(400, 'احفظ ٤ كلمات على الأقل لتبدأ تحدّيًا.');
  const id = crypto.randomBytes(6).toString('hex');
  const ch = { id, from: req.userId, to, words, scores: {}, at: new Date().toISOString() };
  await kvSet(`challenge:${id}`, ch);
  for (const uid of [req.userId, to]) {
    const list = await kvGet(`challenges:${uid}`, []);
    await kvSet(`challenges:${uid}`, [id, ...list].slice(0, 30));
  }
  return { ok: true, id };
}));

async function challengeView(ch, me) {
  const [a, b] = [await getUser(ch.from), await getUser(ch.to)];
  return {
    id: ch.id, at: ch.at, count: ch.words.length,
    players: [a, b].filter(Boolean).map((u) => ({ id: u.id, name: nameOf(u), me: u.id === me, score: ch.scores[u.id] ?? null })),
    played: ch.scores[me] != null,
  };
}

router.get('/challenges', wrap(async (req) => {
  const ids = await kvGet(`challenges:${req.userId}`, []);
  const out = [];
  for (const id of ids) {
    const ch = await kvGet(`challenge:${id}`, null);
    if (ch) out.push(await challengeView(ch, req.userId));
  }
  return { challenges: out };
}));

router.get('/challenges/:id', wrap(async (req) => {
  const ch = await kvGet(`challenge:${String(req.params.id).replace(/[^a-f0-9]/g, '')}`, null);
  if (!ch || (ch.from !== req.userId && ch.to !== req.userId)) throw httpError(404, 'التحدّي غير موجود.');
  return { ...(await challengeView(ch, req.userId)), words: ch.words };
}));

router.post('/challenges/:id/score', wrap(async (req) => {
  const key = `challenge:${String(req.params.id).replace(/[^a-f0-9]/g, '')}`;
  const ch = await kvGet(key, null);
  if (!ch || (ch.from !== req.userId && ch.to !== req.userId)) throw httpError(404, 'التحدّي غير موجود.');
  if (ch.scores[req.userId] == null) {
    ch.scores[req.userId] = Math.max(0, Math.min(ch.words.length, Number(req.body?.score) || 0));
    await kvSet(key, ch);
  }
  return challengeView(ch, req.userId);
}));

/* --------------------------------------------- my videos: order, marks, sections */
router.get('/vidprefs', wrap(async (req) => ({ prefs: await kvGet(`vidprefs:${req.userId}`, null) })));
router.post('/vidprefs', wrap(async (req) => {
  const p = req.body?.prefs || {};
  const ids = (a) => (Array.isArray(a) ? a.map(Number).filter((x) => x > 0).slice(0, 2000) : []);
  const map = (o, ok) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => Number(k) > 0 && ok(v)).slice(0, 2000));
  const clean = {
    fav: ids(p.fav), order: ids(p.order), hidden: ids(p.hidden),
    mark: map(p.mark, (v) => v === 'ok' || v === 'review'),
    sec: map(p.sec, (v) => typeof v === 'string' && v.length <= 30),
  };
  await kvSet(`vidprefs:${req.userId}`, clean);
  return { ok: true };
}));

/* --------------------------------------------------- share my progress */
router.post('/share', wrap(async (req) => {
  let token = await kvGet(`share-of:${req.userId}`, null);
  if (!token) {
    token = crypto.randomBytes(8).toString('hex');
    await kvSet(`share-of:${req.userId}`, token);
    await kvSet(`share:${token}`, req.userId);
  }
  return { token };
}));

// public (no login): only totals and the latest learned words, nothing private
router.get('/share/:token', wrap(async (req) => {
  const uid = await kvGet(`share:${String(req.params.token).replace(/[^a-f0-9]/g, '')}`, null);
  const u = uid && (await getUser(uid));
  if (!u) throw httpError(404, 'الرابط غير صالح.');
  const words = (await listWords(uid)).filter((w) => w.status === 'mastered' || w.review_count > 0).slice(0, 30)
    .map((w) => ({ term: w.term, arabic: w.user_arabic || w.arabic || '' }));
  return { name: nameOf(u), ...(await progressOf(uid)), words };
}));

export default router;
