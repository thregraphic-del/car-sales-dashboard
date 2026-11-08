// Game: صح أم خطأ بالصوت — hear the word (not shown), is this its meaning?
import { speak } from '../audio.js';
import { esc, icon, shuffle } from '../ui.js';
import { reveal, letters } from './shared.js';

export default {
  key: 'soundtf',
  name: 'صح أم خطأ بالصوت',
  en: 'Hear it: true or false',
  icon: 'ear',
  description: 'تسمع الكلمة بدون ما تشوفها: هل هذا معناها؟',
  can: (w) => !!w.arabic && letters(w).length >= 2,
  play: (stage, w, pool) => new Promise((resolve) => {
    const others = shuffle((pool || []).filter((x) => x.uv_id !== w.uv_id && x.arabic && x.arabic !== w.arabic));
    const truth = !others.length || Math.random() < 0.5;
    const shown = truth ? w.arabic : others[0].arabic;
    setTimeout(() => speak(w.term).catch(() => {}), 250);
    stage.innerHTML = `<div class="card question"><div class="prompt">اسمع الكلمة… هل هذا معناها؟</div>
        <button class="big-play" data-say="${esc(w.term)}" aria-label="استمع">${icon.speaker}</button>
        <div class="tf-meaning" style="margin-top:10px">${esc(shown)}</div></div>
      <div class="options tf-options"><button class="option tf-yes" data-v="1">✓ صح</button><button class="option tf-no" data-v="0">✗ خطأ</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    let done = false;
    stage.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => {
      if (done) return;
      done = true;
      const ok = (b.dataset.v === '1') === truth;
      b.classList.add(ok ? 'correct' : 'wrong');
      stage.querySelectorAll('.option').forEach((x) => { x.disabled = true; });
      reveal(stage, w, ok);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.addEventListener('click', () => resolve(ok));
    }));
  }),
};
