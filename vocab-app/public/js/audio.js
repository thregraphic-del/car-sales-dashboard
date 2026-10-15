// Pronunciation audio. Uses the server TTS proxy when a provider is configured
// (keys never reach the browser); otherwise the browser's speechSynthesis.
import { state } from './state.js';

let currentAudio = null;

let voiceList = [];
function currentVoices() {
  if (!('speechSynthesis' in window)) return [];
  const v = speechSynthesis.getVoices();
  if (v.length) voiceList = v;
  return voiceList;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  currentVoices();
  speechSynthesis.addEventListener?.('voiceschanged', currentVoices);
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
const recordedReady = new Map(); // word → url | null, once known
/** Look up (in the background) the recorded pronunciation of these words. */
export function prefetchPronunciation(words) {
  for (const w of words || []) recordedUrl(w);
}
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
      .then((url) => { recordedReady.set(w, url); return url; })
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

let speaking = null; // keep the utterance referenced (Chrome drops events of collected ones)

export function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
}

/**
 * Speak text. rate: 1 = normal, 0.7 = slow. Resolves when finished.
 * Speech starts synchronously (no network wait first) so phones accept it as
 * part of the tap that asked for it.
 */
export function speak(text, { rate = 1, lang = 'en' } = {}) {
  if (!text) return Promise.resolve();
  stop();
  const base = state.user?.speech_rate || 1;
  const finalRate = Math.max(0.5, Math.min(1.5, rate * base));
  if (lang === 'ar') text = arabicForSpeech(text) || text;
  const single = lang === 'en' && !/\s/.test(text.trim());
  const key = text.trim().toLowerCase();
  if (single) {
    if (recordedReady.has(key)) {
      const url = recordedReady.get(key);
      if (url) return playUrl(url, finalRate).catch(() => browserSpeak(text, lang, finalRate));
    } else recordedUrl(key); // ready for next time
  }
  if (state.config?.tts?.server) {
    return playUrl(`/api/tts?${new URLSearchParams({ text, speed: 1, lang })}`, finalRate).catch(() => browserSpeak(text, lang, finalRate));
  }
  return browserSpeak(text, lang, finalRate);
}

function browserSpeak(text, lang, rate) {
  if (!('speechSynthesis' in window)) return Promise.reject(new Error('Speech is not supported in this browser'));
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(currentVoices(), lang);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || (lang === 'ar' ? 'ar-SA' : 'en-US');
    u.rate = lang === 'ar' ? rate * 0.9 : rate; // Arabic a little slower = clearer
    u.pitch = 1;
    let done = false;
    // Some phones never fire "end": don't let the listening game wait forever.
    const guard = setTimeout(() => finish(), 2500 + (text.length * 110) / rate);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(guard);
      if (speaking === u) speaking = null;
      resolve();
    }
    u.onend = finish;
    u.onerror = finish;
    speaking = u;
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(u);
  });
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
