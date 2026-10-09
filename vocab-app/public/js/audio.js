// Pronunciation audio. Uses the server TTS proxy when a provider is configured
// (keys never reach the browser); otherwise the browser's speechSynthesis.
import { state } from './state.js';

let currentAudio = null;
let voicesReady = null;

function loadVoices() {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });
  return voicesReady;
}

// Novelty / low-quality system voices (macOS, iOS) that mispronounce normal speech.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|espeak/i;
const GOOD = {
  en: /natural|neural|premium|enhanced|siri|google us english|samantha|aria|jenny|guy|ava|allison|susan|zira|daniel|karen|moira|serena/i,
  ar: /natural|neural|premium|enhanced|siri|google|majed|maged|tarik|laila|hamed|zariyah|salma|shakir|naayf|hoda/i,
};

/** Best installed voice for a language: native locale, natural-sounding, never a novelty voice. */
function pickVoice(voices, lang) {
  const locales = lang === 'ar' ? ['ar-SA', 'ar-EG', 'ar-AE', 'ar'] : ['en-US', 'en-GB', 'en-AU', 'en'];
  const score = (v) => {
    const l = (v.lang || '').replace('_', '-');
    const li = locales.findIndex((p) => l.toLowerCase().startsWith(p.toLowerCase()));
    if (li < 0 || NOVELTY.test(v.name)) return -1;
    return (GOOD[lang === 'ar' ? 'ar' : 'en'].test(v.name) ? 100 : 0) + (v.localService === false ? 5 : 0) + (v.default ? 3 : 0) + (10 - li);
  };
  let best = null;
  let top = -1;
  for (const v of voices) {
    const sc = score(v);
    if (sc > top) { top = sc; best = v; }
  }
  return best;
}

/** Arabic meaning → a short, clean phrase a voice reads naturally. */
export function arabicForSpeech(text) {
  return String(text || '').split(/[/؛;|]/)[0].replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[«»"“”…]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Real recorded pronunciation of single English words (free dictionary API).
const recorded = new Map();
function recordedUrl(word) {
  const w = String(word || '').trim().toLowerCase();
  if (!/^[a-z][a-z'-]{0,30}$/.test(w)) return Promise.resolve(null);
  if (!recorded.has(w)) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    recorded.set(w, fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const urls = list.flatMap((e) => e.phonetics || []).map((p) => p.audio).filter((a) => /^https:\/\//.test(a || ''));
        return urls.find((a) => /-us\.mp3$/.test(a)) || urls.find((a) => /-(uk|au)\.mp3$/.test(a)) || urls[0] || null;
      })
      .catch(() => null)
      .finally(() => clearTimeout(t)));
  }
  return recorded.get(w);
}

function playUrl(url, rate) {
  const audio = new Audio(url);
  audio.playbackRate = rate;
  currentAudio = audio;
  return new Promise((resolve, reject) => {
    audio.onended = resolve;
    audio.onerror = reject;
    audio.play().catch(reject);
  });
}

export function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** Speak text. rate: 1 = normal, 0.7 = slow. Resolves when finished. */
export async function speak(text, { rate = 1, lang = 'en' } = {}) {
  if (!text) return;
  stop();
  const base = state.user?.speech_rate || 1;
  const finalRate = Math.max(0.5, Math.min(1.5, rate * base));
  if (lang === 'ar') text = arabicForSpeech(text) || text;
  if (lang === 'en' && !/\s/.test(text.trim())) {
    const url = await recordedUrl(text);
    if (url) {
      try {
        await playUrl(url, finalRate);
        return;
      } catch { /* fall back */ }
    }
  }
  if (state.config?.tts?.server) {
    try {
      await playUrl(`/api/tts?${new URLSearchParams({ text, speed: 1, lang })}`, finalRate);
      return;
    } catch {
      /* fall back to browser voice */
    }
  }
  if (!('speechSynthesis' in window)) throw new Error('Speech is not supported in this browser');
  const voices = await loadVoices();
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(voices, lang);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || (lang === 'ar' ? 'ar-SA' : 'en-US');
    u.rate = lang === 'ar' ? finalRate * 0.9 : finalRate; // Arabic a little slower = clearer
    u.pitch = 1;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
