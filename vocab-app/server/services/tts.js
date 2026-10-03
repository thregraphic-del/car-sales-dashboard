// Server-side text-to-speech proxy. API keys stay on the server (env vars).
// If no provider is configured the client falls back to the browser's
// built-in speechSynthesis voices.
//
//   TTS_PROVIDER = openai | elevenlabs | google
//   TTS_API_KEY  = provider key
//   TTS_VOICE    = optional voice id/name
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

// Serverless file systems are read-only except the temp dir.
const CACHE_DIR = config.app.production
  ? path.join(os.tmpdir(), 'lexitube-audio')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'audio-cache');

export function ttsConfigured() {
  return Boolean(config.tts.provider && config.tts.apiKey());
}

export function ttsInfo() {
  return { server: ttsConfigured(), provider: ttsConfigured() ? config.tts.provider : null };
}

async function synthesize(text, { speed, lang }) {
  const { provider, voice } = config.tts;
  const key = config.tts.apiKey();
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.tts.model || 'gpt-4o-mini-tts', voice: voice || 'alloy', input: text, speed, response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`TTS provider HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (provider === 'elevenlabs') {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice || '21m00Tcm4TlvDq8ikWAM'}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: config.tts.model || 'eleven_multilingual_v2', voice_settings: { speed } }),
    });
    if (!res.ok) throw new Error(`TTS provider HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (provider === 'google') {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lang === 'ar' ? 'ar-XA' : 'en-US', ...(voice && lang !== 'ar' ? { name: voice } : {}) },
        audioConfig: { audioEncoding: 'MP3', speakingRate: speed },
      }),
    });
    if (!res.ok) throw new Error(`TTS provider HTTP ${res.status}`);
    const data = await res.json();
    return Buffer.from(data.audioContent, 'base64');
  }
  throw new Error(`Unknown TTS_PROVIDER: ${provider}`);
}

/** Returns an mp3 Buffer (cached on disk). */
export async function speak(text, { speed = 1, lang = 'en' } = {}) {
  const clean = String(text).slice(0, 400);
  const s = Math.max(0.5, Math.min(1.5, Number(speed) || 1));
  const hash = crypto.createHash('sha1').update(`${config.tts.provider}|${config.tts.voice}|${lang}|${s}|${clean}`).digest('hex');
  const file = path.join(CACHE_DIR, `${hash}.mp3`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const audio = await synthesize(clean, { speed: s, lang });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, audio);
  return audio;
}
