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

// Without a paid provider, the free natural voice of Google Translate is used
// (TTS_PROVIDER=off turns server voices off; the browser's voices are used then).
const provider = () => (config.tts.provider && config.tts.apiKey() ? config.tts.provider : config.tts.provider === 'off' ? null : 'google-free');

export function ttsConfigured() {
  return Boolean(provider());
}

export function ttsInfo() {
  return { server: ttsConfigured(), provider: provider() };
}

/** Split long text at sentence/comma borders into parts the free voice accepts (≤ 190 chars). */
export function splitForSpeech(text, max = 190) {
  const parts = [];
  let rest = String(text).replace(/\s+/g, ' ').trim();
  while (rest.length > max) {
    let cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('? ', max), rest.lastIndexOf('! ', max), rest.lastIndexOf('، ', max));
    if (cut < max / 3) cut = rest.lastIndexOf(', ', max);
    if (cut < max / 3) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function googleFree(text, lang) {
  const parts = splitForSpeech(text);
  const out = [];
  for (const [i, part] of parts.entries()) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang === 'ar' ? 'ar' : 'en-US'}&total=${parts.length}&idx=${i}&textlen=${part.length}&q=${encodeURIComponent(part)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36', Referer: 'https://translate.google.com/' },
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('audio')) throw new Error(`free voice HTTP ${res.status}`);
      out.push(Buffer.from(await res.arrayBuffer()));
    } finally {
      clearTimeout(timer);
    }
  }
  return Buffer.concat(out);
}

async function synthesize(text, { speed, lang }) {
  if (provider() === 'google-free') return googleFree(text, lang);
  const { provider: name, voice } = config.tts;
  const key = config.tts.apiKey();
  if (name === 'openai') {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.tts.model || 'gpt-4o-mini-tts', voice: voice || 'alloy', input: text, speed, response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`TTS provider HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (name === 'elevenlabs') {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice || '21m00Tcm4TlvDq8ikWAM'}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: config.tts.model || 'eleven_multilingual_v2', voice_settings: { speed } }),
    });
    if (!res.ok) throw new Error(`TTS provider HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (name === 'google') {
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
  throw new Error(`Unknown TTS_PROVIDER: ${name}`);
}

/** Returns an mp3 Buffer (cached on disk). */
export async function speak(text, { speed = 1, lang = 'en' } = {}) {
  const clean = String(text).slice(0, 600);
  const s = Math.max(0.5, Math.min(1.5, Number(speed) || 1));
  const hash = crypto.createHash('sha1').update(`${provider()}|${config.tts.voice}|${lang}|${s}|${clean}`).digest('hex');
  const file = path.join(CACHE_DIR, `${hash}.mp3`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const audio = await synthesize(clean, { speed: s, lang });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, audio);
  return audio;
}
