import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as repo from './repo.js';
import * as service from './service.js';
import { getDb, dbFile, ROOT } from './db.js';
import { TranscriptError } from './youtube.js';
import { aiStatus, aiConfigured, aiModel, OFFLINE_MESSAGE_EN } from './ai.js';
import { ttsInfo, ttsConfigured, speak } from './tts.js';
import { seedIfEmpty, resetDatabase, seedDemo } from './seed.js';

const app = express();
// Identity of THIS copy of the app: shown in the UI and at /api/version so it
// is always clear which folder and version a browser is talking to.
export const APP = { version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version, root: ROOT, ui: 'v2-four-pages' };

app.use(express.json({ limit: '4mb' }));

// Single-learner prototype: every request acts as user 1. Every user table is
// keyed by user_id, so real auth (e.g. Supabase Auth) can be added later.
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
const STARTED = new Date().toISOString();
const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const idList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(Number).filter(Boolean);

/* ------------------------------------------------------------ config */

app.get('/api/version', (_req, res) => res.json({ app: 'LexiTube', ...APP, pid: process.pid, started_at: STARTED }));
app.get('/api/config', wrap(async (req) => ({
  app: APP,
  ai: aiStatus(),
  tts: ttsInfo(),
  user: repo.ensureUser(req.userId),
  database: { engine: 'sqlite', file: path.relative(ROOT, dbFile()) },
})));

app.patch('/api/me', wrap(async (req) => {
  const b = req.body || {};
  const patch = {};
  if (typeof b.name === 'string') patch.name = b.name.slice(0, 60);
  if (b.daily_goal !== undefined) patch.daily_goal = Math.max(4, Math.min(40, Number(b.daily_goal) || 10));
  if (b.speak_arabic !== undefined) patch.speak_arabic = b.speak_arabic ? 1 : 0;
  if (b.speech_rate !== undefined) patch.speech_rate = Math.max(0.5, Math.min(1.5, Number(b.speech_rate) || 1));
  return repo.updateUser(req.userId, patch);
}));

/* ----------------------------------------------------------- today */

app.get('/api/today', wrap(async (req) => ({ plan: repo.getTodayPlan(req.userId), stats: repo.stats(req.userId) })));
app.post('/api/today/extend', wrap(async (req) => repo.extendTodayPlan(req.userId, Number(req.body?.count) || 5)));
app.get('/api/stats', wrap(async (req) => repo.stats(req.userId)));

/* --------------------------------------------------------- sources */

app.post('/api/sources/youtube', wrap(async (req, res) => {
  try {
    return await service.analyzeYoutube(req.body || {}, req.userId);
  } catch (err) {
    if (err instanceof TranscriptError) {
      res.status(422).json({ error: err.message, code: err.code, details: err.details, video: err.meta });
      return undefined;
    }
    throw err;
  }
}));
app.post('/api/sources/text', wrap(async (req) => service.analyzeText(req.body?.text, req.userId, req.body?.title)));
app.get('/api/sources', wrap(async (req) => repo.listSources(req.userId)));
app.get('/api/sources/:id', wrap(async (req) => repo.sourceView(Number(req.params.id), req.userId)));
app.delete('/api/sources/:id', wrap(async (req) => {
  repo.deleteSource(Number(req.params.id));
  return { ok: true };
}));
app.get('/api/sources/:id/translation', wrap(async (req) => service.translationStatus(Number(req.params.id))));
app.post('/api/sources/:id/translation', wrap(async (req) => {
  const id = Number(req.params.id);
  const src = repo.getSource(id);
  if (src && src.translation_status === 'failed') {
    // allow retry
    getDb().prepare(`UPDATE sources SET translation_status='none' WHERE id=?`).run(id);
  }
  service.startTranslation(id);
  return service.translationStatus(id);
}));

/* -------------------------------------------------- words in context */

app.get('/api/lookup', wrap(async (req) => service.lookup({
  line_id: num(req.query.line_id), word: req.query.word, vocabulary_id: num(req.query.vocabulary_id), context: req.query.context === '1',
}, req.userId)));

/** Save a word. Body: {vocabulary_id, occurrence_id?, group_ids?} */
app.post('/api/words', wrap(async (req) => {
  const b = req.body || {};
  if (!b.vocabulary_id) throw repo.httpError(400, 'لا توجد كلمة للحفظ.');
  const out = repo.saveWord(req.userId, Number(b.vocabulary_id), { occurrenceId: num(b.occurrence_id), groupIds: idList(b.group_ids) });
  return { ...out, groups: repo.groupIdsFor(out.uv_id) };
}));
app.post('/api/words/dismiss', wrap(async (req) => {
  repo.dismissWord(req.userId, Number(req.body?.vocabulary_id));
  return { ok: true };
}));
app.post('/api/words/reset', wrap(async (req) => {
  repo.resetVocabularyState(req.userId, Number(req.body?.vocabulary_id));
  return { ok: true };
}));
app.post('/api/words/delete', wrap(async (req) => ({ deleted: repo.unsaveWords(req.userId, idList(req.body?.uv_ids)) })));
app.get('/api/words', wrap(async (req) => {
  const q = req.query;
  return repo.listWords(req.userId, {
    q: q.q, level: q.level, status: q.status, group_id: num(q.group_id), source_id: num(q.source_id), section: q.section, from: q.from, to: q.to,
    ids: q.ids ? idList(q.ids) : undefined,
  });
}));
app.get('/api/words/:id', wrap(async (req) => repo.getWord(req.userId, Number(req.params.id))));
app.patch('/api/words/:id', wrap(async (req) => repo.updateWord(req.userId, Number(req.params.id), req.body || {})));
app.put('/api/words/:id/groups', wrap(async (req) => ({ group_ids: repo.setWordGroups(req.userId, Number(req.params.id), idList(req.body?.group_ids)) })));
app.delete('/api/words/:id', wrap(async (req) => {
  repo.unsaveWord(req.userId, Number(req.params.id));
  return { ok: true };
}));

/* ---------------------------------------------------------- import */

app.post('/api/import/preview', wrap(async (req) => {
  const text = String(req.body?.text || '');
  if (!text.trim()) throw repo.httpError(400, 'الصق كلمات أو نصًا أولًا.');
  if (text.length > 200000) throw repo.httpError(413, 'النص طويل جدًا. قسّمه إلى أجزاء أصغر.');
  return service.importPreview(text, req.userId);
}));
app.post('/api/import/save', wrap(async (req) => ({
  results: service.importSave(req.body?.items || [], { groupIds: idList(req.body?.group_ids) }, req.userId),
})));

/* ---------------------------------------------------------- groups */

app.get('/api/groups', wrap(async (req) => repo.listGroups(req.userId)));
app.post('/api/groups', wrap(async (req) => repo.createGroup(req.userId, req.body?.name, req.body?.color)));
app.patch('/api/groups/:id', wrap(async (req) => repo.renameGroup(req.userId, Number(req.params.id), req.body?.name)));
app.delete('/api/groups/:id', wrap(async (req) => {
  repo.deleteGroup(req.userId, Number(req.params.id));
  return { ok: true };
}));
app.post('/api/groups/:id/words', wrap(async (req) => {
  repo.addToGroup(req.userId, Number(req.params.id), idList(req.body?.uv_ids));
  return { ok: true };
}));
app.delete('/api/groups/:id/words', wrap(async (req) => {
  repo.removeFromGroup(req.userId, Number(req.params.id), idList(req.body?.uv_ids));
  return { ok: true };
}));

/* -------------------------------------------------------- practice */

app.get('/api/practice', wrap(async (req) => repo.practiceSet(req.userId, {
  ids: req.query.ids ? idList(req.query.ids) : undefined,
  group_id: num(req.query.group_id),
  focus: req.query.focus || 'smart',
  size: Math.min(30, Number(req.query.size) || 10),
})));

app.post('/api/review', wrap(async (req) => {
  const { uv_id, grade, source } = req.body || {};
  if (!['hard', 'good', 'easy'].includes(grade)) throw repo.httpError(400, 'grade must be hard, good or easy');
  const src = typeof source === 'string' && /^(flashcard|today|listening|quiz|game:[a-z-]+)$/.test(source) ? source : 'flashcard';
  return repo.recordReview(req.userId, Number(uv_id), grade, src);
}));

/* ---------------------------------------------------------- export */

app.get('/api/export', wrap(async (req, res) => {
  const rows = repo.exportRows(req.userId, req.query);
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'json') {
    res.set('Content-Disposition', `attachment; filename="lexitube-words-${stamp}.json"`);
    return { exported_at: new Date().toISOString(), count: rows.length, words: rows };
  }
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="lexitube-words-${stamp}.csv"`).send(repo.toCsv(rows));
  return undefined;
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

app.post('/api/admin/reset-demo', wrap(async () => {
  resetDatabase();
  return seedDemo();
}));

/* ----------------------------------------------------------- static */

// no-cache: the browser must revalidate every file, so an update is never
// hidden behind an old cached app.js or page module.
app.use(express.static(path.join(ROOT, 'public'), {
  extensions: ['html'],
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

// Human-readable errors only — stack traces stay in the server log.
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  const message = status >= 500 && !err.expose ? 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.' : err.message;
  res.status(status).json({ error: status === 413 && !err.message.match(/[؀-ۿ]/) ? 'النص طويل جدًا.' : message });
});

export { app };

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  getDb();
  const seeded = seedIfEmpty();
  if (seeded) console.log('First run — demo data created:', seeded);
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`LexiTube v${APP.version} running on http://localhost:${port}`);
    console.log(`  project folder: ${ROOT}`);
    console.log(`  database: ${dbFile()}`);
    console.log(`  AI: ${aiConfigured() ? `OpenRouter (${aiModel()}) — offline dictionary first, results cached` : OFFLINE_MESSAGE_EN}`);
    console.log(`  text-to-speech: ${ttsConfigured() ? process.env.TTS_PROVIDER : 'browser voices'}`);
  });
  // Port already taken (usually an older LexiTube still running): say exactly
  // which copy is occupying it instead of failing silently.
  server.on('error', async (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    let other = null;
    try {
      other = await (await fetch(`http://127.0.0.1:${port}/api/version`)).json();
    } catch {
      /* not LexiTube, or an old version without /api/version */
    }
    console.error('');
    console.error(`✖ Port ${port} is already in use — this copy (v${APP.version}) did NOT start.`);
    if (other?.root) console.error(`  Another LexiTube v${other.version} is running from: ${other.root} (PID ${other.pid})`);
    else console.error('  Probably an OLDER LexiTube (v1) is still running in another window.');
    console.error('  Close the other LexiTube window (or press Ctrl+C in it), then start this one again.');
    console.error(`  المنفذ ${port} مستخدم — أغلق نافذة LexiTube القديمة ثم شغّل هذه النسخة من جديد.`);
    process.exit(1);
  });
}
