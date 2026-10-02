import express from 'express';
import path from 'node:path';
import * as repo from './repo.js';
import { getDb, get, dbFile, ROOT } from './db.js';
import { parseYoutubeId, getVideoWithTranscript, getVideoMeta, parsePastedTranscript, TranscriptError } from './youtube.js';
import { extractVocabulary, claudeConfigured } from './extractor.js';
import { ttsInfo, ttsConfigured, speak } from './tts.js';
import { seedIfEmpty, resetDatabase, seedDemo, seedStreak } from './seed.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

// Single-learner prototype: every request acts as user 1. The schema is
// multi-user ready — swap this for real auth (e.g. Supabase Auth) later.
app.use((req, _res, next) => {
  req.userId = repo.DEFAULT_USER_ID;
  next();
});

const wrap = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    next(err);
  }
};

/* ------------------------------------------------------------ config */

app.get('/api/config', wrap(async (req) => ({
  ai: { configured: claudeConfigured(), engine: claudeConfigured() ? 'claude' : 'dictionary' },
  tts: ttsInfo(),
  user: repo.ensureUser(req.userId),
  database: { engine: 'sqlite', file: path.relative(ROOT, dbFile()) },
})));

app.get('/api/me', wrap(async (req) => repo.ensureUser(req.userId)));
app.patch('/api/me', wrap(async (req) => {
  const patch = {};
  if (typeof req.body.name === 'string') patch.name = req.body.name.slice(0, 60);
  if (req.body.daily_goal !== undefined) patch.daily_goal = Math.max(4, Math.min(40, Number(req.body.daily_goal) || 10));
  if (req.body.speak_arabic !== undefined) patch.speak_arabic = req.body.speak_arabic ? 1 : 0;
  if (req.body.speech_rate !== undefined) patch.speech_rate = Math.max(0.5, Math.min(1.5, Number(req.body.speech_rate) || 1));
  return repo.updateUser(req.userId, patch);
}));

/* -------------------------------------------------------- dashboard */

app.get('/api/stats', wrap(async (req) => repo.stats(req.userId)));
app.get('/api/progress', wrap(async (req) => repo.progress(req.userId, Number(req.query.days) || 30)));

/* --------------------------------------------------------- analyzer */

app.post('/api/analyze', wrap(async (req, res) => {
  const { url, transcript, force } = req.body || {};
  const youtubeId = parseYoutubeId(url);
  if (!youtubeId) throw repo.httpError(400, 'This does not look like a YouTube video link.');

  const existing = repo.findVideoByYoutubeId(youtubeId);
  if (existing && !force && !transcript) {
    const items = repo.videoItems(existing.id, req.userId);
    if (items.length) return { video: existing, items, cached: true };
  }

  let meta;
  let segments;
  let source;
  if (transcript && transcript.trim()) {
    segments = parsePastedTranscript(transcript);
    source = 'pasted';
    try {
      meta = await getVideoMeta(youtubeId);
    } catch {
      meta = { youtube_id: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}`, title: 'YouTube video', channel: null, duration_seconds: null, thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` };
    }
  } else {
    try {
      ({ meta, segments, source } = await getVideoWithTranscript(youtubeId));
    } catch (err) {
      if (err instanceof TranscriptError) {
        res.status(422).json({ error: err.message, code: err.code, details: err.details, video: err.meta });
        return undefined;
      }
      throw err;
    }
  }

  const { items, engine, word_count } = await extractVocabulary({ title: meta.title, channel: meta.channel, segments });
  if (!items.length) {
    res.status(422).json({ error: 'No B1–C1 vocabulary worth learning was found in this transcript.', code: 'no_items', video: meta });
    return undefined;
  }
  const videoId = repo.saveAnalysis({ ...meta, transcript_source: source, extractor: engine, word_count }, items);
  return { video: repo.getVideo(videoId), items: repo.videoItems(videoId, req.userId), cached: false };
}));

app.get('/api/videos', wrap(async (req) => repo.listVideos(req.userId)));
app.get('/api/videos/:id', wrap(async (req) => {
  const video = repo.getVideo(Number(req.params.id));
  if (!video) throw repo.httpError(404, 'Video not found');
  return { video, items: repo.videoItems(video.id, req.userId) };
}));

app.post('/api/items/:vvId/save', wrap(async (req) => {
  const uvId = repo.saveWord(req.userId, Number(req.params.vvId));
  return repo.getWord(req.userId, uvId);
}));
app.post('/api/items/:vvId/dismiss', wrap(async (req) => {
  repo.dismissWord(req.userId, Number(req.params.vvId));
  return { ok: true };
}));
app.post('/api/items/:vvId/reset', wrap(async (req) => {
  const vv = get('SELECT vocabulary_id FROM video_vocabulary WHERE id = ?', Number(req.params.vvId));
  if (!vv) throw repo.httpError(404, 'Item not found');
  const uv = get('SELECT id FROM user_vocabulary WHERE user_id=? AND vocabulary_id=?', req.userId, vv.vocabulary_id);
  if (uv) repo.unsaveWord(req.userId, uv.id);
  return { ok: true };
}));

/* ------------------------------------------------------- vocabulary */

app.get('/api/words', wrap(async (req) => {
  const q = req.query;
  const ids = q.ids ? String(q.ids).split(',').filter(Boolean) : undefined;
  return repo.listWords(req.userId, {
    q: q.q, level: q.level, status: q.status, video_id: q.video_id, section: q.section,
    from: q.from, to: q.to, campaign_id: q.campaign_id, topic: q.topic, ids,
  });
}));
app.get('/api/words/:id', wrap(async (req) => repo.getWord(req.userId, Number(req.params.id))));
app.delete('/api/words/:id', wrap(async (req) => {
  repo.unsaveWord(req.userId, Number(req.params.id));
  return { ok: true };
}));
app.get('/api/topics', wrap(async (req) => repo.topics(req.userId)));

/* ----------------------------------------------------------- review */

app.post('/api/review', wrap(async (req) => {
  const { uv_id, grade, source } = req.body || {};
  if (!['hard', 'good', 'easy'].includes(grade)) throw repo.httpError(400, 'grade must be hard, good or easy');
  const src = typeof source === 'string' && /^(flashcard|today|listening|game:[a-z-]+)$/.test(source) ? source : 'flashcard';
  return repo.recordReview(req.userId, Number(uv_id), grade, src);
}));

app.get('/api/today', wrap(async (req) => repo.getTodayPlan(req.userId)));
app.post('/api/today/extend', wrap(async (req) => repo.extendTodayPlan(req.userId, Number(req.body?.count) || 5)));

app.get('/api/games/pool', wrap(async (req) => {
  const words = repo.gamePool(req.userId, req.query.scope || 'mixed', req.query.campaign_id ? Number(req.query.campaign_id) : null);
  // Distractors may come from any saved word.
  const others = repo.listWords(req.userId);
  return { words, distractors: others };
}));

/* -------------------------------------------------------- campaigns */

app.get('/api/campaigns', wrap(async (req) => repo.listCampaigns(req.userId)));
app.post('/api/campaigns', wrap(async (req) => {
  const id = repo.createCampaign(req.userId, req.body || {});
  return repo.getCampaign(req.userId, id);
}));
app.get('/api/campaigns/:id', wrap(async (req) => repo.getCampaign(req.userId, Number(req.params.id))));
app.delete('/api/campaigns/:id', wrap(async (req) => {
  repo.deleteCampaign(req.userId, Number(req.params.id));
  return { ok: true };
}));

/* -------------------------------------------------------------- tts */

app.get('/api/tts', async (req, res, next) => {
  if (!ttsConfigured()) return res.status(404).json({ error: 'tts_not_configured' });
  try {
    const audio = await speak(String(req.query.text || ''), { speed: req.query.speed, lang: req.query.lang === 'ar' ? 'ar' : 'en' });
    res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'public, max-age=31536000').send(audio);
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------- admin */

app.get('/api/export', wrap(async (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="lexitube-vocabulary.json"');
  return { exported_at: new Date().toISOString(), words: repo.listWords(req.userId), campaigns: repo.listCampaigns(req.userId) };
}));

app.post('/api/admin/reset-demo', wrap(async () => {
  resetDatabase();
  const out = seedDemo();
  seedStreak();
  return out;
}));

/* ----------------------------------------------------------- static */

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.expose ? err.message || 'Server error' : err.message });
});

export { app };

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  getDb();
  const seeded = seedIfEmpty();
  if (seeded) console.log('First run — demo data created:', seeded);
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`LexiTube running on http://localhost:${port}`);
    console.log(`  database: ${dbFile()}`);
    console.log(`  vocabulary engine: ${claudeConfigured() ? 'Claude (context-aware)' : 'offline dictionary (set ANTHROPIC_API_KEY for AI analysis)'}`);
    console.log(`  text-to-speech: ${ttsConfigured() ? process.env.TTS_PROVIDER : 'browser voices'}`);
  });
}
