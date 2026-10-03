// /api/version, /api/config, /api/me — app identity and the learner's settings.
import { Router } from 'express';
import { config } from '../config.js';
import { wrap, str } from '../http.js';
import { aiStatus } from '../services/ai.js';
import { ttsInfo } from '../services/tts.js';
import { ensureUser, updateUser, publicUser } from '../data/users.js';
import { dialect } from '../db/index.js';

const router = Router();
const STARTED = new Date().toISOString();

router.get('/version', (_req, res) => res.json({ app: config.app.name, version: config.app.version, ui: 'v3', started_at: STARTED }));

router.get('/config', wrap(async (req) => ({
  app: { name: config.app.name, version: config.app.version, production: config.app.production, timezone: config.app.timezone },
  ai: aiStatus(),
  tts: ttsInfo(),
  user: publicUser(await ensureUser(req.userId)),
  database: { engine: await dialect() },
  auth: { required: config.auth.required },
  features: { demo_reset: config.features.demoReset },
  limits: { daily_goal_min: config.limits.dailyGoalMin, daily_goal_max: config.limits.dailyGoalMax, import_chunk_rows: config.limits.importChunkRows },
})));

router.patch('/me', wrap(async (req) => {
  const b = req.body || {};
  const patch = {};
  const { dailyGoalMin: lo, dailyGoalMax: hi } = config.limits;
  if (typeof b.name === 'string') patch.name = str(b.name.trim(), 60) || 'Learner';
  if (b.daily_goal !== undefined) patch.daily_goal = Math.max(lo, Math.min(hi, Math.round(Number(b.daily_goal)) || config.learning.defaultDailyGoal));
  if (b.speak_arabic !== undefined) patch.speak_arabic = b.speak_arabic ? 1 : 0;
  if (b.speech_rate !== undefined) patch.speech_rate = Math.max(0.5, Math.min(1.5, Number(b.speech_rate) || 1));
  return publicUser(await updateUser(req.userId, patch));
}));

export default router;
