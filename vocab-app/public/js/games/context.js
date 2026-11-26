// Game: تحدّي السياق (Context challenge)
import { esc, highlight, termRegex } from '../ui.js';

// the English sentence with the word replaced by a blank: ____
const cloze = (sentence, term) => {
  const t = String(sentence || '');
  const re = termRegex(term || '');
  const m = re && t.match(re);
  if (!m) return null;
  return `${esc(t.slice(0, m.index))}<span class="cz-blank">&nbsp;______&nbsp;</span>${esc(t.slice(m.index + m[0].length))}`;
};
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
  // 🔁 mixes the languages: sometimes the English sentence with Arabic choices,
  // sometimes the Arabic sentence with English choices
  play: (stage, w, pool) => {
    const flip = !!w.context_arabic && Math.random() < 0.5;
    const blank = flip ? cloze(w.context_sentence, w.term) : null;
    if (flip && blank) {
      return choice(stage, w, {
        prompt: `<div class="q-sentence" dir="rtl">«${esc(w.context_arabic)}»</div>
          <div class="q-sentence q-cloze en-inline" dir="ltr">${blank}</div>
          <div class="prompt" style="margin-top:12px">اختر الكلمة الإنجليزية اللي تكمّل الفراغ <small class="muted">(معناها: <b>${esc(String(w.arabic).split('/')[0].trim())}</b>)</small></div>`,
        options: distractors(w, pool, 3, (x) => x.term.toLowerCase()),
        text: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
        sentence: w.context_sentence,
        hintOpts: { sentence: false, arabic: false },
      });
    }
    return choice(stage, w, {
      prompt: `<div class="q-sentence">“${highlight(w.context_sentence, w.term)}” ${sayBtns(w.context_sentence)}</div>
        ${w.context_arabic ? `<button type="button" class="btn sm ghost q-ar-btn" data-show-ar>🌐 الترجمة</button><p class="ctx-ar tiny muted hidden" dir="rtl">${esc(w.context_arabic)}</p>` : ''}
        <div class="prompt" style="margin-top:12px">ماذا تعني <b class="en-inline">${esc(w.term)}</b> هنا؟</div>`,
      options: distractors(w, pool, 3, (x) => x.arabic),
      text: (o) => esc(o.arabic),
      sentence: w.context_sentence,
      hintOpts: { sentence: false },
    });
  },
};
