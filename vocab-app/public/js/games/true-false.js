// Game: صح أو خطأ (True or false)
import { esc } from '../ui.js';
import { distractors, reveal } from './shared.js';

export default {
  key: 'truefalse',
  name: 'صح أو خطأ',
  en: 'True or false',
  icon: 'check',
  description: 'هل المعنى المعروض صحيح؟ قرار سريع.',
  /** Can this word be asked in this format? */
  can: (w) => !!w.arabic,
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w, pool) => new Promise((resolve) => {
    const other = distractors(w, pool, 1, (x) => x.arabic)[0];
    const showTrue = !other || Math.random() < 0.5;
    const shown = showTrue ? w.arabic : other.arabic;
    stage.innerHTML = `<div class="card question"><div class="prompt">هل هذا هو المعنى الصحيح؟</div>
        <div class="q-big">${esc(w.term)}</div><div class="tf-meaning">${esc(shown)}</div></div>
      <div class="options tf-options"><button class="option tf-yes" data-v="1">✓ صح</button><button class="option tf-no" data-v="0">✗ خطأ</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    let done = false;
    stage.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      if (done) return;
      done = true;
      const ok = (b.dataset.v === '1') === showTrue;
      stage.querySelectorAll('[data-v]').forEach((x) => (x.disabled = true));
      b.classList.add(ok ? 'correct' : 'wrong');
      reveal(stage, w, ok);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    }));
  }),
};
