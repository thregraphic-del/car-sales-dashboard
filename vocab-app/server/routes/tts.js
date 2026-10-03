// /api/tts — optional server-side voices (keys stay on the server).
import { Router } from 'express';
import { ttsConfigured, speak } from '../services/tts.js';

const router = Router();

router.get('/', async (req, res, next) => {
  if (!ttsConfigured()) return res.status(404).json({ error: 'tts_not_configured' });
  try {
    const audio = await speak(String(req.query.text || '').slice(0, 400), { speed: req.query.speed, lang: req.query.lang === 'ar' ? 'ar' : 'en' });
    return res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'private, max-age=31536000').send(audio);
  } catch (err) {
    return next(err);
  }
});

export default router;
