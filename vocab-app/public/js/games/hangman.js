// Game: خمّن الكلمة (Guess the word) — pick letters before 6 misses.
import { esc } from '../ui.js';
import { letters, reveal } from './shared.js';

export default {
  key: 'guess',
  name: 'خمّن الكلمة',
  en: 'Guess the word',
  icon: 'search',
  description: 'اختر الحروف واكشف الكلمة قبل ٦ أخطاء.',
  can: (w) => /^[a-z]{3,12}$/i.test(letters(w)) && !!w.arabic,
  play: (stage, w) => new Promise((resolve) => {
    const word = letters(w).toLowerCase();
    const got = new Set();
    let miss = 0;
    const draw = () => [...word].map((c) => (got.has(c) ? c : '_')).join(' ');
    stage.innerHTML = `<div class="card question"><div class="prompt">المعنى: <b>${esc(w.arabic)}</b></div>
        <div class="en big-word" dir="ltr" id="hw">${draw()}</div><div class="tiny muted" id="hm">الأخطاء: 0 / 6</div></div>
      <div class="kbd en" dir="ltr">${[...'abcdefghijklmnopqrstuvwxyz'].map((c) => `<button class="key" data-c="${c}">${c}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    let done = false;
    const finish = (ok) => {
      done = true;
      stage.querySelector('#hw').textContent = [...word].join(' ');
      reveal(stage, w, ok);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.addEventListener('click', () => resolve(ok));
    };
    stage.querySelectorAll('.key').forEach((k) => k.addEventListener('click', () => {
      if (done || k.disabled) return;
      k.disabled = true;
      const c = k.dataset.c;
      if (word.includes(c)) { got.add(c); k.classList.add('hit'); } else { miss += 1; k.classList.add('miss'); }
      stage.querySelector('#hw').textContent = draw();
      stage.querySelector('#hm').textContent = `الأخطاء: ${miss} / 6`;
      if ([...word].every((x) => got.has(x))) finish(miss < 6);
      else if (miss >= 6) finish(false);
    }));
  }),
};
