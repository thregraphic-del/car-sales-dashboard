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

function pickVoice(voices, lang) {
  const prefs = lang === 'ar' ? ['ar-SA', 'ar'] : ['en-US', 'en-GB', 'en'];
  for (const p of prefs) {
    const natural = voices.find((v) => v.lang?.startsWith(p) && /natural|neural|premium|enhanced|google/i.test(v.name));
    if (natural) return natural;
    const any = voices.find((v) => v.lang?.startsWith(p));
    if (any) return any;
  }
  return null;
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
  if (state.config?.tts?.server) {
    try {
      const audio = new Audio(`/api/tts?${new URLSearchParams({ text, speed: finalRate, lang })}`);
      currentAudio = audio;
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      });
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
    u.rate = finalRate;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
