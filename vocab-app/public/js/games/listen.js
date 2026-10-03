// Game: استمع واختر (Listen & choose)
import { speak } from '../audio.js';
import { esc, icon } from '../ui.js';
import { distractors, choice } from './shared.js';

export default {
  key: 'listen',
  name: 'استمع واختر',
  en: 'Listen & choose',
  icon: 'ear',
  description: 'استمع للكلمة واختر ما سمعت.',
  /** Can this word be asked in this format? */
  can: () => true,
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w, pool) => {
    setTimeout(() => speak(w.term).catch(() => {}), 250);
    return choice(stage, w, {
      prompt: `<div class="prompt">استمع واختر الكلمة التي سمعتها</div>
        <button class="big-play" data-say="${esc(w.term)}" data-rate="1" aria-label="تشغيل">${icon.speaker}</button>
        <div style="margin-top:8px"><button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="0.6">🐢 بطيء</button></div>`,
      options: distractors(w, pool, 3, (x) => x.term.toLowerCase()),
      text: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
    });
  },
};
