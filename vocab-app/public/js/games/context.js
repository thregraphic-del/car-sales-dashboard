// Game: تحدّي السياق (Context challenge)
import { esc, highlight } from '../ui.js';
import { distractors, choice } from './shared.js';

export default {
  key: 'context',
  name: 'تحدّي السياق',
  en: 'Context challenge',
  icon: 'quote',
  description: 'جملة حقيقية: ماذا تعني الكلمة هنا؟',
  /** Can this word be asked in this format? */
  can: (w) => !!(w.context_sentence && w.arabic),
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w, pool) => choice(stage, w, {
    prompt: `<div class="prompt">${w.source?.title ? `من <span class="en-inline">“${esc(w.source.title.slice(0, 48))}”</span>` : 'جملة حقيقية'}</div>
      <div class="q-sentence">“${highlight(w.context_sentence, w.term)}”</div>
      <div class="prompt" style="margin-top:12px">ماذا تعني <b class="en-inline">${esc(w.term)}</b> هنا؟</div>`,
    options: distractors(w, pool, 3, (x) => x.arabic),
    text: (o) => esc(o.arabic),
    after: w.context_arabic ? `<div class="small" style="margin-top:6px">${esc(w.context_arabic)}</div>` : '',
  }),
};
