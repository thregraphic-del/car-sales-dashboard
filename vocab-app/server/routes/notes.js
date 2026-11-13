// 📒 «خلاصاتي»: video summaries the learner kept, with their own notes.
// Kept as one small JSON value per learner (no new table): a snapshot of the summary,
// the learner's note, and the sentences they pointed at with @minute.
import { Router } from 'express';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { all, get, run } from '../db/index.js';

const router = Router();
const key = (userId) => `notes:${userId}`;
const MAX = 300;
const clean = (s, n) => String(s ?? '').slice(0, n);

async function load(userId) {
  const row = await get('SELECT value FROM app_settings WHERE key = ?', key(userId));
  try { const v = JSON.parse(row?.value || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function save(userId, list) {
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key(userId), JSON.stringify(list.slice(0, MAX)));
}
const strList = (a, n, len) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => clean(x, len));
function cleanSummary(s = {}) {
  return {
    kind: clean(s.kind, 20), kind_ar: clean(s.kind_ar, 60),
    sections: (Array.isArray(s.sections) ? s.sections : []).slice(0, 6).map((x) => ({ emoji: clean(x?.emoji, 8), title: clean(x?.title, 80), items: strList(x?.items, 12, 600) })),
    idea: clean(s.idea, 1500), benefit: clean(s.benefit, 1000),
    points: strList(s.points, 12, 600), steps: strList(s.steps, 12, 600),
    quotes: (Array.isArray(s.quotes) ? s.quotes : []).slice(0, 8).map((q) => ({ en: clean(q?.en, 400), ar: clean(q?.ar, 400) })),
  };
}
const cleanRefs = (refs) => (Array.isArray(refs) ? refs : []).slice(0, 40).map((r) => ({
  t: Math.max(0, Math.round(Number(r?.t) || 0)), en: clean(r?.en, 400), ar: clean(r?.ar, 400),
}));

/** The kept summaries, newest first, with the video's picture, channel and title. */
router.get('/', wrap(async (req) => {
  const list = await load(req.userId);
  const ids = list.map((n) => Number(n.source_id)).filter(Boolean);
  const src = new Map();
  if (ids.length) {
    for (const s of await all(`SELECT id, kind, youtube_id, title, channel, thumbnail_url FROM sources WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, req.userId, ...ids)) src.set(Number(s.id), s);
  }
  return {
    notes: list.map((n) => {
      const s = src.get(Number(n.source_id));
      return { ...n, exists: !!s, title: s?.title || n.title, channel: s?.channel || n.channel || '', youtube_id: s?.youtube_id || n.youtube_id || null, thumbnail_url: s?.thumbnail_url || n.thumbnail_url || null };
    }),
  };
}));

/** Keep (or refresh) a video's summary. */
router.post('/', wrap(async (req) => {
  const b = req.body || {};
  const id = Number(b.source_id);
  const s = await get('SELECT id, youtube_id, title, channel, thumbnail_url FROM sources WHERE id = ? AND user_id = ?', id, req.userId);
  if (!s) throw httpError(404, 'المقطع غير موجود.');
  const list = await load(req.userId);
  const old = list.find((n) => Number(n.source_id) === id);
  const item = {
    source_id: id, title: s.title, channel: s.channel || '', youtube_id: s.youtube_id || null, thumbnail_url: s.thumbnail_url || null,
    saved_at: old?.saved_at || new Date().toISOString(), summary: cleanSummary(b.summary), note: old?.note || '', refs: old?.refs || [],
  };
  await save(req.userId, [item, ...list.filter((n) => Number(n.source_id) !== id)]);
  return { ok: true, note: item };
}));

/** The learner's own note (with the @minute sentences it points at). */
router.put('/:sourceId', wrap(async (req) => {
  const id = Number(req.params.sourceId);
  const list = await load(req.userId);
  const item = list.find((n) => Number(n.source_id) === id);
  if (!item) throw httpError(404, 'ما لقينا هذه الخلاصة.');
  item.note = clean(req.body?.note, 6000);
  item.refs = cleanRefs(req.body?.refs);
  item.edited_at = new Date().toISOString();
  await save(req.userId, list);
  return { ok: true, note: item };
}));

router.delete('/:sourceId', wrap(async (req) => {
  const id = Number(req.params.sourceId);
  await save(req.userId, (await load(req.userId)).filter((n) => Number(n.source_id) !== id));
  return { ok: true };
}));

export default router;
