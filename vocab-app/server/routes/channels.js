// /api/channels — suggested YouTube channels: well-known ones in five fields,
// the channels of the learner's own videos, and the ones they added; the
// learner can pin, hide, add and edit them.
import { Router } from 'express';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { all, get, run } from '../db/index.js';
import { oembed } from '../lib/youtube.js';
import { AiError } from '../services/ai.js';
import { suggestChannelsWithAi, suggestVideosWithAi, moreChannelsWithAi } from '../services/extractor.js';

const router = Router();

/** Two of the best-known channels in five fields — always offered. */
export const FIXED = [
  { field: 'تعليم وأفكار', name: 'TED', handle: 'TED' },
  { field: 'تعليم وأفكار', name: 'TED-Ed', handle: 'TEDEd' },
  { field: 'تعلّم الإنجليزية', name: 'BBC Learning English', handle: 'bbclearningenglish' },
  { field: 'تعلّم الإنجليزية', name: 'English with Lucy', handle: 'EnglishwithLucy' },
  { field: 'علوم', name: 'Kurzgesagt', handle: 'kurzgesagt' },
  { field: 'علوم', name: 'Veritasium', handle: 'veritasium' },
  { field: 'تطوير الذات والإنتاجية', name: 'Ali Abdaal', handle: 'aliabdaal' },
  { field: 'تطوير الذات والإنتاجية', name: 'Mel Robbins', handle: 'melrobbins' },
  { field: 'صحة وعلم نفس', name: 'Huberman Lab', handle: 'hubermanlab' },
  { field: 'صحة وعلم نفس', name: 'Psych2Go', handle: 'Psych2Goofficial' },
];

const key = (userId) => `channels:${userId}`;
const clean = (s, n = 80) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const handleOf = (url) => (String(url || '').match(/youtube\.com\/@([A-Za-z0-9._-]+)/) || [])[1] || '';
const urlOf = (c) => (c.handle ? `https://www.youtube.com/@${c.handle}` : c.url || `https://www.youtube.com/results?search_query=${encodeURIComponent(c.name)}&sp=EgIQAg%3D%3D`);
const idOf = (c) => (c.handle ? `@${c.handle.toLowerCase()}` : `n:${c.name.toLowerCase()}`);

async function prefsOf(userId) {
  const row = await get('SELECT value FROM app_settings WHERE key = ?', key(userId));
  try {
    const p = JSON.parse(row?.value || '{}');
    return { pinned: p.pinned || [], hidden: p.hidden || [], custom: p.custom || [], known: p.known || {} };
  } catch {
    return { pinned: [], hidden: [], custom: [], known: {} };
  }
}
async function savePrefs(userId, prefs) {
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key(userId), JSON.stringify(prefs));
}

/** The channels of the learner's videos (their YouTube address found once through oEmbed). */
async function ownChannels(userId, prefs) {
  const rows = await all(`SELECT channel, youtube_id, COUNT(*) AS n FROM sources WHERE user_id = ? AND kind = 'youtube' AND is_demo = 0 AND channel IS NOT NULL
    GROUP BY channel, youtube_id ORDER BY n DESC`, userId);
  const byName = new Map();
  for (const r of rows) if (!byName.has(r.channel)) byName.set(r.channel, { name: r.channel, video: r.youtube_id, n: Number(r.n) });
  let changed = false;
  await Promise.all([...byName.values()].slice(0, 12).map(async (c) => {
    if (prefs.known[c.name] === undefined) {
      const oe = await oembed(c.video).catch(() => null);
      prefs.known[c.name] = oe?.author_url || '';
      changed = true;
    }
    c.url = prefs.known[c.name] || '';
    c.handle = handleOf(c.url);
  }));
  if (changed) await savePrefs(userId, prefs);
  return [...byName.values()].map((c) => ({ name: c.name, handle: c.handle, url: c.url, field: 'من مقاطعك', mine: true }));
}

router.get('/', wrap(async (req) => {
  const prefs = await prefsOf(req.userId);
  const seen = new Set();
  const list = [];
  const add = (c, kind) => {
    const id = idOf(c);
    if (seen.has(id)) return;
    seen.add(id);
    list.push({ ...c, id, kind, url: urlOf(c), pinned: prefs.pinned.includes(id), hidden: prefs.hidden.includes(id) });
  };
  prefs.custom.forEach((c) => add(c, 'custom'));
  (await ownChannels(req.userId, prefs)).forEach((c) => add(c, 'mine'));
  FIXED.forEach((c) => add(c, 'fixed'));
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return { channels: list };
}));

/** Pin / hide / show / add / edit / remove a channel. */
router.post('/', wrap(async (req) => {
  const b = req.body || {};
  const prefs = await prefsOf(req.userId);
  const id = clean(b.id, 120);
  const toggle = (arr, on) => { const i = arr.indexOf(id); if (on && i < 0) arr.push(id); if (!on && i >= 0) arr.splice(i, 1); };
  if (b.action === 'pin') toggle(prefs.pinned, true);
  else if (b.action === 'unpin') toggle(prefs.pinned, false);
  else if (b.action === 'hide') toggle(prefs.hidden, true);
  else if (b.action === 'show') toggle(prefs.hidden, false);
  else if (b.action === 'add' || b.action === 'edit') {
    let url = clean(b.url, 200);
    let handle = clean(b.handle, 60).replace(/^@/, '') || handleOf(url);
    // ✨ no name typed: read it from the channel's YouTube page (one request, only when adding)
    let name = clean(b.name);
    if (!name && (handle || /youtube\.com\//.test(url))) {
      const meta = await channelMeta(handle ? `https://www.youtube.com/@${handle}` : url);
      name = clean(meta?.name);
      if (!handle && meta?.handle) { handle = meta.handle; url = ''; }
    }
    if (!name) throw Object.assign(httpError(400, 'ما لقينا اسم القناة — اكتبه.'), { code: 'need_name' });
    const c = { name, handle, url: handle ? '' : url, field: clean(b.field, 40) || 'قنواتي' };
    if (b.action === 'edit') prefs.custom = prefs.custom.filter((x) => idOf(x) !== id);
    if (prefs.custom.length >= 60) throw httpError(400, 'وصلت للحد الأعلى من القنوات.');
    prefs.custom.unshift(c);
    toggle(prefs.hidden, false);
  } else if (b.action === 'remove') {
    prefs.custom = prefs.custom.filter((x) => idOf(x) !== id);
    toggle(prefs.hidden, true);
  } else throw httpError(400, 'إجراء غير معروف.');
  await savePrefs(req.userId, prefs);
  return { ok: true };
}));

/** Channels like the learner's (AI). */
// ✔ Channels by field: each @handle is checked ONCE on YouTube (real page link + logo) and saved
// for everyone. A handle YouTube doesn't know is remembered as missing and never shown.
/** Name (+ @handle) of a YouTube channel from its page — used once when a learner adds one. */
async function channelMeta(url) {
  if (!/^https:\/\/(www\.|m\.)?youtube\.com\//.test(url)) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(url, { signal: ctl.signal, headers: { 'Accept-Language': 'en', 'User-Agent': 'Mozilla/5.0 (compatible; LexiTube)', Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    const dec = (x) => String(x || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const name = dec(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1]).replace(/\s*-\s*YouTube$/, '');
    const handle = (html.match(/"canonicalBaseUrl":"\/@([A-Za-z0-9._-]+)"/) || html.match(/youtube\.com\/@([A-Za-z0-9._-]+)/) || [])[1] || '';
    return name ? { name, handle } : null;
  } catch { return null; }
}

async function checkHandle(handle) {
  const key = `ytch:${handle.toLowerCase()}`;
  const hit = await get('SELECT value FROM app_settings WHERE key = ?', key);
  if (hit) { try { return JSON.parse(hit.value); } catch { /* re-check */ } }
  let out = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      signal: ctl.signal, headers: { 'Accept-Language': 'en', 'User-Agent': 'Mozilla/5.0 (compatible; LexiTube)', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
    });
    clearTimeout(t);
    if (res.status === 404) out = { ok: false };
    else if (res.ok) {
      const html = await res.text();
      const canon = html.match(/<link rel="canonical" href="(https:\/\/www\.youtube\.com\/channel\/[\w-]+)"/)?.[1];
      const logo = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || '';
      out = canon ? { ok: true, url: `https://www.youtube.com/@${handle}`, logo: /^https:\/\/yt3\.(googleusercontent|ggpht)\.com\//.test(logo) ? logo : '' } : null;
    }
  } catch { out = null; }
  if (out) await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(out));
  return out; // null = YouTube didn't answer now: try again another time
}

router.post('/check', wrap(async (req) => {
  const handles = [...new Set((Array.isArray(req.body?.handles) ? req.body.handles : []).map((h) => String(h).replace(/[^\w.-]/g, '')).filter(Boolean))].slice(0, 40);
  const started = Date.now();
  const result = {};
  await Promise.all(handles.map(async (h) => {
    if (Date.now() - started > 15000) return;
    result[h] = await checkHandle(h);
  }));
  return { channels: result };
}));

// ＋ more channels for a field: AI once per field/level/page (cached for everyone), each one checked on YouTube
router.post('/more', wrap(async (req, res) => {
  const field = clean(req.body?.field, 40);
  const level = ['1', '2', '3'].includes(String(req.body?.level)) ? String(req.body.level) : '';
  const page = Math.max(1, Math.min(5, Number(req.body?.page) || 1));
  const have = (Array.isArray(req.body?.have) ? req.body.have : []).map((h) => clean(h, 60)).slice(0, 150);
  if (!field) throw httpError(400, 'اختر مجالًا.');
  try {
    const r = await moreChannelsWithAi({ field, level, page, have });
    const known = new Set(have.map((h) => h.toLowerCase()));
    const list = r.channels.map((c) => ({ ...c, handle: String(c.handle || '').replace(/^@/, '').replace(/[^\w.-]/g, '') }))
      .filter((c) => c.handle && !known.has(c.handle.toLowerCase())).slice(0, 12);
    const checked = await Promise.all(list.map(async (c) => ({ c, v: await checkHandle(c.handle) })));
    return { channels: checked.filter(({ v }) => v?.ok !== false).map(({ c, v }) => ({ name: c.name, handle: c.handle, type: c.field, url: v?.url || `https://www.youtube.com/@${c.handle}`, logo: v?.logo || '' })) };
  } catch (err) {
    if (err instanceof AiError) return res.status(503).json({ error: 'الاقتراحات غير متاحة الحين.' });
    throw err;
  }
}));

router.post('/similar', wrap(async (req, res) => {
  const prefs = await prefsOf(req.userId);
  const mine = (await ownChannels(req.userId, prefs)).map((c) => c.name);
  const names = [...mine, ...prefs.custom.map((c) => c.name)].slice(0, 15);
  try {
    const r = await suggestChannelsWithAi({ names: names.length ? names : FIXED.map((c) => c.name) });
    return { ok: true, channels: r.channels.filter((c) => c.name).slice(0, 10).map((c) => ({ ...c, handle: c.handle.replace(/^@/, ''), url: urlOf({ ...c, handle: c.handle.replace(/^@/, '') }) })) };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message });
    return undefined;
  }
}));

/** Video ideas from one channel (only videos that exist and belong to it). */
router.post('/videos', wrap(async (req, res) => {
  const name = clean(req.body?.name);
  if (!name) throw httpError(400, 'ما فيه قناة.');
  try {
    const r = await suggestVideosWithAi({ titles: [], duration: 'medium', day: new Date().toISOString().slice(0, 10), channel: name, fresh: Boolean(req.body?.fresh) });
    const ids = [...new Set(r.videos.map((v) => v.youtube_id).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x)))].slice(0, 10);
    const checked = await Promise.all(ids.map(async (vid) => {
      const oe = await oembed(vid).catch(() => null);
      if (!oe?.title) return null;
      return { youtube_id: vid, url: `https://www.youtube.com/watch?v=${vid}`, title: oe.title, channel: oe.author_name, thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` };
    }));
    return { ok: true, videos: checked.filter(Boolean) };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message });
    return undefined;
  }
}));

export default router;
