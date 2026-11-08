// Game: اسمع وأكمل الجملة — hear a sentence, pick the missing word.
import { speak } from '../audio.js';
import { esc, icon } from '../ui.js';
import { blankable, distractors, choice } from './shared.js';

export default {
  key: 'listenfill',
  name: 'اسمع وأكمل الجملة',
  en: 'Listen & complete',
  icon: 'headphones',
  description: 'اسمع الجملة، واختر الكلمة الناقصة.',
  can: (w) => !!blankable(w),
  play: (stage, w, pool) => {
    const b = blankable(w);
    setTimeout(() => speak(b.sentence, { rate: 0.9 }).catch(() => {}), 300);
    return choice(stage, w, {
      prompt: `<div class="prompt">اسمع الجملة واختر الكلمة الناقصة</div>
        <button class="big-play" data-say="${esc(b.sentence)}" data-rate="0.9" aria-label="استمع">${icon.speaker}</button>
        <div class="q-sentence" style="margin-top:8px">${esc(b.sentence.slice(0, b.index))}<span class="blank">&nbsp;</span>${esc(b.sentence.slice(b.index + b.match.length))}</div>`,
      options: distractors(w, pool, 3, (x) => x.term.toLowerCase()),
      text: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
      sentence: b.sentence,
    });
  },
};
