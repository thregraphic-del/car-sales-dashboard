// Game: اكتب ما تسمع (Spelling)
import { speak } from '../audio.js';
import { esc, icon } from '../ui.js';
import { letters, reveal } from './shared.js';

export default {
  key: 'spell',
  name: 'اكتب ما تسمع',
  en: 'Spelling',
  icon: 'speaker',
  description: 'استمع واكتب الكلمة بالإنجليزية.',
  /** Can this word be asked in this format? */
  can: (w) => letters(w).length >= 3 && letters(w).split(' ').length <= 3,
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w) => new Promise((resolve) => {
    const target = letters(w);
    setTimeout(() => speak(target).catch(() => {}), 250);
    stage.innerHTML = `<div class="card question"><div class="prompt">استمع واكتب الكلمة</div>
        <button class="big-play" data-say="${esc(target)}" data-rate="1" aria-label="تشغيل">${icon.speaker}</button>
        <div style="margin-top:8px"><button class="btn sm ghost" data-say="${esc(target)}" data-rate="0.55">🐢 بطيء</button></div>
        ${w.arabic ? `<div class="small muted" style="margin-top:8px">التلميح: ${esc(w.arabic)}</div>` : ''}</div>
      <form id="sf" class="url-row" style="margin-top:14px"><input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type what you hear…"><button class="btn primary" type="submit">تحقّق</button></form>
      <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" id="skip">لا أعرف</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    const input = stage.querySelector('#ans');
    input.focus();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      input.disabled = true;
      reveal(stage, w, ok, ok ? '' : ` — كتبتَ: <span class="en-inline">${esc(input.value || '—')}</span>`);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    };
    const norm = (x) => x.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
    stage.querySelector('#sf').addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) finish(norm(input.value) === norm(target));
    });
    stage.querySelector('#skip').addEventListener('click', () => finish(false));
  }),
};
