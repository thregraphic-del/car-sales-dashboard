// The API as an Express app. Used by both the local server (server/index.js)
// and the Netlify Function (netlify/functions/api.mjs).
import socialRoutes from './routes/social.js';
import { recordDeploy, creditStatus, saveCreditSettings } from './data/credits.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { DEFAULT_USER_ID, ensureUser } from './data/users.js';
import { userFromToken } from './services/auth.js';
import { aiContext } from './services/ai.js';
import { parseYoutubeId } from './lib/youtube.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import learningRoutes from './routes/learning.js';
import sourceRoutes from './routes/sources.js';
import wordRoutes from './routes/words.js';
import importRoutes from './routes/import.js';
import groupRoutes from './routes/groups.js';
import dataRoutes from './routes/data.js';
import ttsRoutes from './routes/tts.js';
import feedbackRoutes from './routes/feedback.js';
import channelRoutes from './routes/channels.js';
import noteRoutes from './routes/notes.js';
import aiRoutes from './routes/ai.js';
import grammarRoutes from './routes/grammar.js';
import teamRoutes from './routes/team.js';
import adminRoutes from './routes/admin.js';

const PUBLIC_PATHS = new Set(['/api/version', '/api/auth/status', '/api/auth/login', '/api/auth/setup', '/api/auth/register', '/api/auth/logout', '/api/auth/forgot', '/api/auth/reset', '/api/auth/guest']);

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Reject cross-site writes (in addition to SameSite cookies). */
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    if (new URL(origin).host === host) return next();
  } catch {
    /* fall through */
  }
  return res.status(403).json({ error: 'طلب مرفوض.' });
}

let localUserReady = null;

async function authenticate(req, res, next) {
  try {
    if (!config.auth.required) {
      // Local app without login: one learner, created on first use.
      localUserReady ??= ensureUser(DEFAULT_USER_ID).catch((err) => {
        localUserReady = null;
        throw err;
      });
      await localUserReady;
      req.userId = DEFAULT_USER_ID;
      return aiContext.run(aiCtx(req), next);
    }
    req.user = await userFromToken(readCookie(req, config.auth.cookieName));
    if (req.user) req.userId = req.user.id;
    if (req.user || PUBLIC_PATHS.has(req.originalUrl.split('?')[0]) || (req.method === 'GET' && /^\/api\/social\/share\/[a-f0-9]+$/.test(req.originalUrl.split('?')[0]))) return aiContext.run(aiCtx(req), next);
    return res.status(401).json({ error: 'سجّل الدخول أولًا.', code: 'auth' });
  } catch (err) {
    return next(err);
  }
}

// who is asking, which request this is, and (when the path names one) which clip it is for — so AI cost can be kept per clip
const aiCtx = (req) => ({ userId: req.userId, reqId: randomUUID(), sourceId: Number(/^\/api\/sources\/(\d+)(?:[/?]|$)/.exec(req.originalUrl || '')?.[1]) || null });

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: config.limits.jsonBody }));
  // 📅 the daily reminder as a calendar file. It must be a real address with the right type so iPhone's Safari
  // offers «Add to Calendar» (a downloaded data: link does nothing there). Nothing private in it: time and days only.
  app.get('/api/reminder.ics', (req, res) => {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.query.time)) ? String(req.query.time) : '21:00';
    const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = [...new Set(String(req.query.days || '').split(',').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    const by = (days.length ? days : [0, 1, 2, 3, 4, 5, 6]).map((d) => BY[d]).join(',');
    const start = /^\d{8}$/.test(String(req.query.start)) ? String(req.query.start) : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^\w.:-]/g, '');
    const proto = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3Goal//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:3goal-reminder-${stamp}@lexitube`, `DTSTAMP:${stamp}Z`,
      `DTSTART:${start}T${time.replace(':', '')}00`, 'DURATION:PT10M', `RRULE:FREQ=WEEKLY;BYDAY=${by}`, 'SUMMARY:3Goal — كمّل إنجازك', 'DESCRIPTION:كمّل إنجازك اليوم في 3Goal', `URL:${proto}://${host}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:3Goal — كمّل إنجازك', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="3goal-reminder.ics"', 'Cache-Control': 'no-store' }).send(ics);
  });
  app.use('/api', sameOrigin);
  // Diagnostics for the operator (INTERNAL_API_KEY): what YouTube allows from this server.
  app.get('/api/internal/youtube-probe', async (req, res, next) => {
    try {
      const key = config.youtube.internalKey();
      if (!key || req.get('x-lexitube-key') !== key) return res.status(403).json({ error: 'forbidden' });
      const id = parseYoutubeId(req.query.v);
      if (!id) return res.status(400).json({ error: 'invalid id' });
      const { probeYoutube } = await import('./lib/youtube-probe.js');
      return res.json(await probeYoutube(id));
    } catch (err) {
      return next(err);
    }
  });
  // Building the built-in dictionary (operator only, DICTIONARY_BUILD_KEY): one batch per call.
  app.all('/api/internal/dictionary', async (req, res, next) => {
    try {
      const key = process.env.DICTIONARY_BUILD_KEY || '';
      if (key.length < 16 || req.get('x-dictionary-key') !== key) return res.status(403).json({ error: 'forbidden' });
      const dict = await import('./services/dictionary.js');
      if (req.method === 'GET') return res.json(await dict.dictionaryStatus());
      const offset = Math.max(0, Number(req.body?.offset) || 0);
      const count = Math.max(1, Math.min(40, Number(req.body?.count) || 20));
      return res.json(await dict.buildDictionaryStep({ offset, count, words: req.body?.words }));
    } catch (err) {
      if (err?.name === 'AiError' || err?.constructor?.name === 'AiError') return res.status(503).json({ error: err.message });
      return next(err);
    }
  });
  // Preparing every dictionary word's family (operator only, same key): one batch per call.
  app.post('/api/internal/forms', async (req, res, next) => {
    try {
      const key = process.env.DICTIONARY_BUILD_KEY || '';
      if (key.length < 16 || req.get('x-dictionary-key') !== key) return res.status(403).json({ error: 'forbidden' });
      const dict = await import('./services/dictionary.js');
      return res.json(await dict.buildFormsStep({ offset: Math.max(0, Number(req.body?.offset) || 0), count: Math.max(1, Math.min(12, Number(req.body?.count) || 8)) }));
    } catch (err) {
      if (err?.name === 'AiError' || err?.constructor?.name === 'AiError') return res.status(503).json({ error: err.message });
      return next(err);
    }
  });
  app.use('/api', authenticate);
  // a new deploy records itself once (the credits estimate) — no background work
  app.use('/api', (req, res, next) => { recordDeploy().catch(() => {}); next(); });
  app.get('/api/credits', async (req, res, next) => {
    try {
      if (req.user?.role && req.user.role !== 'admin') return res.status(403).json({ error: 'للمالك فقط' });
      return res.json(await creditStatus());
    } catch (err) { return next(err); }
  });
  app.post('/api/credits', async (req, res, next) => {
    try {
      if (req.user?.role && req.user.role !== 'admin') return res.status(403).json({ error: 'للمالك فقط' });
      const b = req.body || {};
      return res.json(await saveCreditSettings({ plan: Number(b.plan), left: b.left === '' || b.left == null ? NaN : Number(b.left), cycleDay: Number(b.cycle_day) }));
    } catch (err) { return next(err); }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', learningRoutes);
  app.use('/api/sources', sourceRoutes);
  app.use('/api', wordRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/tts', ttsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/feedback', feedbackRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/grammar', grammarRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

  // Human-readable errors only — details stay in the server log, never in responses.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[api]', err.message);
    let message = err.expose || status < 500 ? err.message : 'صار خطأ غير متوقع في الخادم. حاول مرة ثانية.';
    if (err.type === 'entity.too.large') message = 'البيانات المرسلة كبيرة جدًا.';
    else if (err.type === 'entity.parse.failed') message = 'بيانات غير صالحة.';
    else if (status < 500 && !/[؀-ۿ]/.test(message || '')) message = err.status ? message : 'طلب غير صالح.';
    res.status(status).json(err.code && err.expose ? { error: message, code: err.code } : { error: message });
  });
  return app;
}
