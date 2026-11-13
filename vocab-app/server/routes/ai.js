// /api/ai — AI status and "explain this" for a selected phrase or sentence.
// The OpenRouter key stays on the server; only the selected text and its own
// sentence are sent (never the whole transcript).
import { Router } from 'express';
import { usageOf } from '../lib/usage.js';
import { config } from '../config.js';
import { wrap, num } from '../http.js';
import { httpError } from '../lib/errors.js';
import { aiStatus, checkModel, usageToday, usageReport, AiError } from '../services/ai.js';
import { explainWithAi, formsWithAi, extractFromFileWithAi, storyWithAi, suggestVideosWithAi, suggestWordsWithAi, ladderWithAi, synonymsWithAi, sayArabicWithAi, simpleExamplesWithAi } from '../services/extractor.js';
import { matchKey } from '../../public/js/shared/text.js';
import { listWords } from '../data/words.js';
import { get, run } from '../db/index.js';
import { listSources } from '../data/sources.js';
import { oembed } from '../lib/youtube.js';
import { getLine, getSource } from '../data/sources.js';

const router = Router();

router.get('/status', wrap(async (req) => {
  await checkModel();
  return { ...aiStatus(), used_today: await usageToday(req.userId) };
}));

router.get('/usage', wrap(async (req) => usageReport(req.userId, { admin: req.user?.role === 'admin' || !config.auth.required })));

router.post('/explain', wrap(async (req, res) => {
  const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw httpError(400, 'حدّد كلمة أو جملة أولًا.');
  if (text.length > config.ai.explainMaxChars) throw httpError(413, `حدّد نصًا أقصر (حتى ${config.ai.explainMaxChars} حرف).`);
  const lineId = num(req.body?.line_id);
  const line = lineId ? await getLine(lineId, req.userId) : null; // only the learner's own transcripts
  const source = line ? await getSource(line.source_id, req.userId) : null;
  try {
    const r = await explainWithAi({ text, sentence: line?.text || '', title: source?.title || '' });
    return { ok: true, text, line_id: line?.id || null, ...r };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message, ai: aiStatus() });
    return undefined;
  }
}));

// 📝 One complete, simple example sentence per word (for the games): saved once for everyone.
router.post('/examples', wrap(async (req) => {
  const items = (Array.isArray(req.body?.words) ? req.body.words : []).slice(0, 40)
    .map((w) => ({ term: String(w.term || '').trim().slice(0, 60), arabic: String(w.arabic || '').slice(0, 60) })).filter((w) => /[a-z]/i.test(w.term));
  const out = {};
  const missing = [];
  for (const w of items) {
    const row = await get('SELECT value FROM app_settings WHERE key = ?', `ex1:${w.term.toLowerCase()}`);
    if (row) { try { out[w.term.toLowerCase()] = JSON.parse(row.value); } catch { missing.push(w); } } else missing.push(w);
  }
  if (missing.length) {
    try {
      for (const it of await simpleExamplesWithAi(missing)) {
        const k = String(it.w || '').toLowerCase().trim();
        if (!missing.some((m) => m.term.toLowerCase() === k) || it.en.split(/\s+/).length < 5) continue;
        out[k] = { sentence: it.en.trim(), arabic: it.ar.trim() };
        await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', `ex1:${k}`, JSON.stringify(out[k]));
      }
    } catch { /* games still work with what exists */ }
  }
  return { examples: out };
}));

// 🔤 Arabic-letter pronunciation: saved once per word for everyone; only the missing ones go to AI.
router.post('/say', wrap(async (req, res) => {
  const terms = [...new Set((Array.isArray(req.body?.terms) ? req.body.terms : []).map((t) => String(t).toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length <= 40))].slice(0, 60);
  const out = {};
  const missing = [];
  for (const t of terms) {
    const row = await get('SELECT value FROM app_settings WHERE key = ?', `sayar:${t}`);
    if (row) out[t] = row.value; else missing.push(t);
  }
  if (missing.length) {
    try {
      const items = await sayArabicWithAi(missing);
      for (const it of items) {
        const w = String(it.w || '').toLowerCase().trim();
        const ar = String(it.ar || '').trim().slice(0, 40);
        if (!missing.includes(w) || !/[\u0600-\u06FF]/.test(ar)) continue;
        out[w] = ar;
        await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', `sayar:${w}`, ar);
      }
    } catch { /* show what we have */ }
  }
  return { say: out };
}));

router.get('/synonyms', wrap(async (req, res) => {
  const word = String(req.query.word || '').toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
  if (!word || word.length > 40) throw httpError(400, 'كلمة غير صالحة.');
  return withAi(res, async () => ({ ok: true, word, items: await synonymsWithAi(word, String(req.query.meaning || '').slice(0, 60)) }));
}));
router.get('/forms', wrap(async (req, res) => {
  const word = String(req.query.word || '').toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
  if (!word || word.length > 40) throw httpError(400, 'كلمة غير صالحة.');
  try {
    const r = await formsWithAi(word);
    return { ok: true, word, ...r, forms: r.forms.map((f) => ({ ...f, usage: f.usage || usageOf(String(f.word || f.form).split(/[\s(]/)[0]) })) };
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message });
    return undefined;
  }
}));

/** Answer an AI failure with its message (the app keeps working without AI). */
async function withAi(res, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    res.status(err.status || 503).json({ ok: false, error: err.message });
    return undefined;
  }
}

// Words from an attached photo or PDF.
const DATA_URL = { image: /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, pdf: /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/ };
router.post('/extract', wrap(async (req, res) => {
  const { kind, data, name } = req.body || {};
  if (!DATA_URL[kind]) throw httpError(400, 'نوع الملف غير مدعوم. أرفق صورة أو PDF.');
  if (typeof data !== 'string' || data.length > 5_500_000) throw httpError(413, 'الملف كبير جدًا (الحد 4 ميغابايت).');
  if (!DATA_URL[kind].test(data)) throw httpError(400, 'ما قدرنا نقرأ الملف.');
  return withAi(res, async () => {
    const items = await extractFromFileWithAi({ kind, data, name: String(name || (kind === 'pdf' ? 'file.pdf' : 'photo')).slice(0, 80) });
    return { ok: true, items };
  });
}));

// A short story with the learner's recent words or a group.
router.post('/story', wrap(async (req, res) => {
  const groupId = num(req.body?.group_id);
  const range = req.body?.range === 'week' ? 'week' : 'recent';
  const count = [10, 20, 30].includes(Number(req.body?.count)) ? Number(req.body.count) : 10;
  const ids = String(req.body?.ids || '').split(',').map(Number).filter((x) => x > 0);
  let words = await listWords(req.userId, groupId ? { group_id: groupId } : range === 'week' ? { section: 'week' } : {});
  if (ids.length) { const want = new Set(ids); words = words.filter((w) => want.has(w.uv_id)); }
  if (groupId || range === 'week') words = words.sort(() => Math.random() - 0.5);
  words = words.slice(0, ids.length ? 30 : count);
  if (words.length < 3) {
    throw httpError(400, groupId ? 'هذه المجموعة فيها أقل من 3 كلمات.' : range === 'week' ? 'حفظت أقل من 3 كلمات هذا الأسبوع.' : 'احفظ 3 كلمات على الأقل لنكتب قصة منها.');
  }
  return withAi(res, async () => {
    const story = await storyWithAi({ words });
    return { ok: true, ...story, words: words.map((w) => ({ uv_id: w.uv_id, term: w.term, arabic: w.user_arabic || w.arabic || '' })) };
  });
}));

// New words to learn: how many, which field — never words the learner already has.
router.post('/suggest-words', wrap(async (req, res) => {
  const count = Math.max(5, Math.min(50, Number(req.body?.count) || 20));
  const topic = String(req.body?.topic || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const level = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(req.body?.level) ? req.body.level : '';
  const mine = await listWords(req.userId);
  const have = new Set(mine.map((w) => matchKey(w.term)));
  return withAi(res, async () => {
    const parts = Math.max(1, Math.min(10, Number(req.body?.parts) || 1));
    const part = Math.max(0, Math.min(parts - 1, Number(req.body?.part) || 0));
    // each round asks again: words already shown first, then a different slice of the learner's words
    const round = Math.max(0, Math.min(8, Number(req.body?.round) || 0));
    const extra = (Array.isArray(req.body?.extra) ? req.body.extra : []).map((t) => String(t).slice(0, 60)).slice(0, 200);
    const terms = mine.map((w) => w.term);
    const from = terms.length > 300 ? (round * 300) % terms.length : 0;
    const avoid = [...extra, ...terms.slice(from), ...terms.slice(0, from)];
    extra.forEach((t) => have.add(matchKey(t)));
    const kind = req.body?.kind === 'sentences' ? 'sentences' : 'words';
    const r = await suggestWordsWithAi({ count: Math.min(30, count * 2), topic, level, avoid: kind === 'sentences' ? extra : avoid, part: (part + round) % parts, parts, kind });
    const seen = new Set();
    const items = r.items.filter((it) => {
      const k = matchKey(it.term);
      if (!k || have.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, count);
    return { ok: true, items };
  });
}));

// Same meaning, every level: the simple word and the advanced ones.
router.post('/ladder', wrap(async (req, res) => {
  const term = String(req.body?.term || '').trim().slice(0, 60);
  const arabic = String(req.body?.arabic || '').trim().slice(0, 80);
  if (!term) return { ok: false, error: 'ما فيه كلمة.' };
  const mine = new Set((await listWords(req.userId)).map((w) => matchKey(w.term)));
  return withAi(res, async () => {
    const r = await ladderWithAi({ term, arabic });
    return { ok: true, items: r.items.map((it) => ({ ...it, saved: mine.has(matchKey(it.term)) })) };
  });
}));

// Video ideas: similar topics, the length the learner likes.
const SEARCH_LENGTH = { short: 'EgIYAQ%3D%3D', medium: 'EgIYAw%3D%3D', long: 'EgIYAg%3D%3D' };
router.get('/suggest-videos', wrap(async (req, res) => {
  const mine = await listSources(req.userId, 12);
  const videos = mine.filter((s) => s.kind === 'youtube');
  const real = videos.filter((s) => !s.is_demo);
  const watched = (real.length ? real : videos).slice(0, 8);
  let duration = ['short', 'medium', 'long'].includes(req.query.duration) ? req.query.duration : null;
  if (!duration) {
    const lens = watched.map((s) => Number(s.duration_seconds)).filter((n) => n > 0);
    const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 600;
    duration = avg < 300 ? 'short' : avg > 1200 ? 'long' : 'medium';
  }
  const day = new Date().toISOString().slice(0, 10);
  // 🎯 the learner's taste: the channels they watch and pinned, and the level of their words
  const prefs = await get('SELECT value FROM app_settings WHERE key = ?', `channels:${req.userId}`);
  let fav = [];
  try { const p = JSON.parse(prefs?.value || '{}'); fav = [...(p.custom || []).map((c) => c.name), ...(p.pinned || [])]; } catch { /* none */ }
  const channels = [...new Set([...watched.map((s) => s.channel).filter(Boolean), ...fav.map((x) => String(x).replace(/^[@n]:?/, ''))])].slice(0, 10);
  const words = await listWords(req.userId);
  const lv = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const counts = lv.map((l) => words.filter((w) => w.level === l).length);
  const level = words.length ? lv[counts.indexOf(Math.max(...counts))] : 'B1';
  return withAi(res, async () => {
    const r = await suggestVideosWithAi({ titles: watched.map((s) => s.title), duration, day, fresh: req.query.fresh === '1', channels, level });
    const have = new Set(videos.map((s) => s.youtube_id));
    const ids = [...new Set(r.videos.map((v) => v.youtube_id).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x) && !have.has(x)))].slice(0, 10);
    // Only videos that really exist on YouTube are shown.
    const checked = await Promise.all(ids.map(async (vid) => {
      const oe = await oembed(vid);
      if (!oe?.title) return null;
      const v = r.videos.find((x) => x.youtube_id === vid);
      return { youtube_id: vid, url: `https://www.youtube.com/watch?v=${vid}`, title: oe.title, channel: oe.author_name || v.channel, thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, minutes: v.minutes, why_ar: v.why_ar };
    }));
    const sp = SEARCH_LENGTH[duration];
    return {
      ok: true,
      duration,
      videos: checked.filter(Boolean),
      topics: r.topics.slice(0, 6).map((t) => ({ ...t, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(t.query)}&sp=${sp}` })),
    };
  });
}));

export default router;
