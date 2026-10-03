// Game: اختر المعنى (Choose the meaning)
import { esc, icon } from '../ui.js';
import { distractors, choice } from './shared.js';

export default {
  key: 'meaning',
  name: 'اختر المعنى',
  en: 'Choose the meaning',
  icon: 'check',
  description: 'اختر المعنى العربي الصحيح.',
  /** Can this word be asked in this format? */
  can: (w) => !!w.arabic,
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w, pool) => choice(stage, w, {
    prompt: `<div class="prompt">ما معنى هذه الكلمة؟</div><div class="q-big">${esc(w.term)}</div>
      <div style="margin-top:8px"><button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="1">${icon.speaker} استمع</button></div>`,
    options: distractors(w, pool, 3, (x) => x.arabic),
    text: (o) => esc(o.arabic),
  }),
};
