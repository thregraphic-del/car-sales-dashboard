// Game: املأ الفراغ (Fill in the blank)
import { esc, highlight } from '../ui.js';
import { blankable, distractors, choice } from './shared.js';

export default {
  key: 'fill',
  name: 'املأ الفراغ',
  en: 'Fill in the blank',
  icon: 'pen',
  description: 'أكمل الجملة بالكلمة المناسبة.',
  /** Can this word be asked in this format? */
  can: (w) => !!blankable(w),
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w, pool) => {
    const b = blankable(w);
    return choice(stage, w, {
      prompt: `<div class="prompt">أكمل الجملة</div>
        <div class="q-sentence">${esc(b.sentence.slice(0, b.index))}<span class="blank">&nbsp;</span>${esc(b.sentence.slice(b.index + b.match.length))}</div>
        ${w.arabic ? `<div class="small muted" style="margin-top:8px">التلميح: ${esc(w.arabic)}</div>` : ''}`,
      options: distractors(w, pool, 3, (x) => x.term.toLowerCase()),
      text: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
      after: `<div class="en small" style="margin-top:6px">${highlight(b.sentence, w.term)}</div>`,
    });
  },
};
