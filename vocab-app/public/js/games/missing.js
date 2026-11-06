// Game: الحروف الناقصة (Missing letters) — fill the hidden letters of the word.
import { esc, icon } from '../ui.js';
import { letters, reveal } from './shared.js';

export default {
  key: 'missing',
  name: 'الحروف الناقصة',
  en: 'Missing letters',
  icon: 'edit',
  description: 'أكمل الحروف المخفية في الكلمة.',
  can: (w) => /^[a-z]{4,14}$/i.test(letters(w)) && !!w.arabic,
  play: (stage, w) => new Promise((resolve) => {
    const word = letters(w);
    // hide about a third of the letters (never the first one)
    const idx = [...word].map((_, i) => i).slice(1).sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.round(word.length / 3))).sort((a, b) => a - b);
    const shown = [...word].map((ch, i) => (idx.includes(i) ? '_' : ch)).join(' ');
    stage.innerHTML = `<div class="card question"><div class="prompt">أكمل الكلمة: <b>${esc(w.arabic)}</b></div>
        <div class="en big-word" dir="ltr">${esc(shown)}</div>
        <button class="btn icon sm ghost" data-say="${esc(word)}" aria-label="استمع">${icon.speaker}</button></div>
      <form id="mf" class="url-row" style="margin-top:14px"><input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the whole word…"><button class="btn primary" type="submit">تحقّق</button></form>
      <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" id="skip">لا أعرف</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    const input = stage.querySelector('#ans');
    input.focus();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      input.disabled = true;
      reveal(stage, w, ok);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    };
    stage.querySelector('#mf').addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) finish(input.value.trim().toLowerCase() === word.toLowerCase());
    });
    stage.querySelector('#skip').addEventListener('click', () => finish(false));
  }),
};
