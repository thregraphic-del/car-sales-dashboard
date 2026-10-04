// The API as an Express app. Used by both the local server (server/index.js)
// and the Netlify Function (netlify/functions/api.mjs).
import express from 'express';
import { config } from './config.js';
import { DEFAULT_USER_ID, ensureUser } from './data/users.js';
import { userFromToken } from './services/auth.js';
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

const PUBLIC_PATHS = new Set(['/api/version', '/api/auth/status', '/api/auth/login', '/api/auth/setup', '/api/auth/register', '/api/auth/logout']);

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
      return next();
    }
    req.user = await userFromToken(readCookie(req, config.auth.cookieName));
    if (req.user) req.userId = req.user.id;
    if (req.user || PUBLIC_PATHS.has(req.originalUrl.split('?')[0])) return next();
    return res.status(401).json({ error: 'سجّل الدخول أولًا.', code: 'auth' });
  } catch (err) {
    return next(err);
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: config.limits.jsonBody }));
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
  app.use('/api', authenticate);

  app.use('/api/auth', authRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', learningRoutes);
  app.use('/api/sources', sourceRoutes);
  app.use('/api', wordRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/tts', ttsRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

  // Human-readable errors only — details stay in the server log, never in responses.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[api]', err.message);
    let message = err.expose || status < 500 ? err.message : 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.';
    if (err.type === 'entity.too.large') message = 'البيانات المرسلة كبيرة جدًا.';
    else if (err.type === 'entity.parse.failed') message = 'بيانات غير صالحة.';
    else if (status < 500 && !/[؀-ۿ]/.test(message || '')) message = err.status ? message : 'طلب غير صالح.';
    res.status(status).json({ error: message });
  });
  return app;
}
