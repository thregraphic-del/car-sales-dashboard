// Game: تحدّي السياق (Context challenge)
import { esc, highlight } from '../ui.js';
import { distractors, choice } from './shared.js';
import { sayBtns } from './shared.js';

export default {
  key: 'context',
  name: 'تحدّي السياق',
  en: 'Context challenge',
  icon: 'quote',
  description: 'جملة حقيقية: ماذا تعني الكلمة هنا؟',
  /** Can this word be asked in this format? */
  can: (w) => !!(w.context_sentence && w.arabic && w.context_sentence.trim().split(/\s+/).length >= 5),
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w, pool) => choice(stage, w, {
    prompt: `<div class="q-sentence">“${highlight(w.context_sentence, w.term)}” ${sayBtns(w.context_sentence)}</div>
      ${w.context_arabic ? `<button type="button" class="btn sm ghost q-ar-btn" data-show-ar>🌐 الترجمة</button><p class="ctx-ar tiny muted hidden" dir="rtl">${esc(w.context_arabic)}</p>` : ''}
      <div class="prompt" style="margin-top:12px">ماذا تعني <b class="en-inline">${esc(w.term)}</b> هنا؟</div>`,
    options: distractors(w, pool, 3, (x) => x.arabic),
    text: (o) => esc(o.arabic),
    sentence: w.context_sentence,
  }),
};
