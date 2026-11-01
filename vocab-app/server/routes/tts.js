// /api/tts — optional server-side voices (keys stay on the server).
import { Router } from 'express';
import { ttsConfigured, speak } from '../services/tts.js';

const router = Router();

router.get('/', async (req, res, next) => {
  if (!ttsConfigured()) return res.status(404).json({ error: 'tts_not_configured' });
  try {
    const text = String(req.query.text || '').trim().slice(0, 600);
    if (!text) return res.status(400).json({ error: 'no text' });
    const audio = await speak(text, { speed: req.query.speed, lang: req.query.lang === 'ar' ? 'ar' : 'en' });
    // Same text → same sound: browsers keep it, so each word is fetched once.
    return res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'private, max-age=31536000, immutable').send(audio);
  } catch {
    return res.status(502).json({ error: 'voice_unavailable' }); // the browser's own voice is used instead
  }
});

export default router;
