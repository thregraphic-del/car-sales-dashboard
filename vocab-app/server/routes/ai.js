// /api/ai — AI status and "explain this" for a selected phrase or sentence.
// The OpenRouter key stays on the server; only the selected text and its own
// sentence are sent (never the whole transcript).
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, num } from '../http.js';
import { httpError } from '../lib/errors.js';
import { aiStatus, checkModel, usageToday, usageReport, AiError } from '../services/ai.js';
import { explainWithAi, formsWithAi, extractFromFileWithAi, storyWithAi, suggestVideosWithAi } from '../services/extractor.js';
import { listWords } from '../data/words.js';
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

router.get('/forms', wrap(async (req, res) => {
  const word = String(req.query.word || '').toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
  if (!word || word.length > 40) throw httpError(400, 'كلمة غير صالحة.');
  try {
    return { ok: true, word, ...(await formsWithAi(word)) };
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
  if (!DATA_URL[kind].test(data)) throw httpError(400, 'تعذّرت قراءة الملف.');
  return withAi(res, async () => {
    const items = await extractFromFileWithAi({ kind, data, name: String(name || (kind === 'pdf' ? 'file.pdf' : 'photo')).slice(0, 80) });
    return { ok: true, items };
  });
}));

// A short story with the learner's recent words or a group.
router.post('/story', wrap(async (req, res) => {
  const groupId = num(req.body?.group_id);
  let words = await listWords(req.userId, groupId ? { group_id: groupId } : {});
  if (groupId) words = words.sort(() => Math.random() - 0.5);
  words = words.slice(0, 10);
  if (words.length < 3) throw httpError(400, groupId ? 'هذه المجموعة فيها أقل من 3 كلمات.' : 'احفظ 3 كلمات على الأقل لنكتب قصة منها.');
  return withAi(res, async () => {
    const story = await storyWithAi({ words });
    return { ok: true, ...story, words: words.map((w) => ({ uv_id: w.uv_id, term: w.term, arabic: w.user_arabic || w.arabic || '' })) };
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
  return withAi(res, async () => {
    const r = await suggestVideosWithAi({ titles: watched.map((s) => s.title), duration, day, fresh: req.query.fresh === '1' });
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
