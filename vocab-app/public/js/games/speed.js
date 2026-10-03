// Game: تحدّي الدقيقة (60-second challenge) — a timed round, not per word.
import { esc, shuffle } from '../ui.js';
import { distractors } from './shared.js';

/** 60-second challenge: as many meanings as possible; each word scored once. */
function round(stage, words, pool, record, onProgress) {
  return new Promise((resolve) => {
    const usable = words.filter((w) => w.arabic);
    const scored = new Set();
    let left = 60;
    let i = 0;
    let streak = 0;
    let points = 0;
    stage.innerHTML = `<div class="speed-top"><span class="score-pill" id="timer">⏱ 60</span><span class="score-pill" id="pts">⭐ 0</span></div><div id="sq"></div>`;
    const timerEl = stage.querySelector('#timer');
    const tick = setInterval(() => {
      left -= 1;
      timerEl.textContent = `⏱ ${left}`;
      onProgress?.(60 - left, 60);
      if (left <= 0) {
        clearInterval(tick);
        resolve(points);
      }
    }, 1000);
    const ask = () => {
      if (left <= 0) return;
      const w = usable[i % usable.length];
      i += 1;
      const opts = shuffle([w, ...distractors(w, pool, 3, (x) => x.arabic)]);
      const q = stage.querySelector('#sq');
      q.innerHTML = `<div class="card question" style="padding:20px"><div class="q-big">${esc(w.term)}</div></div>
        <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${esc(o.arabic)}</button>`).join('')}</div>`;
      q.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => {
        const ok = opts[Number(b.dataset.k)].uv_id === w.uv_id;
        b.classList.add(ok ? 'correct' : 'wrong');
        q.querySelectorAll('.option').forEach((x) => (x.disabled = true));
        if (ok) {
          streak += 1;
          points += 1 + Math.floor(streak / 3);
        } else streak = 0;
        stage.querySelector('#pts').textContent = `⭐ ${points}${streak >= 3 ? ` 🔥×${streak}` : ''}`;
        if (!scored.has(w.uv_id)) {
          scored.add(w.uv_id);
          record(w, ok);
        }
        setTimeout(ask, ok ? 250 : 700);
      }));
    };
    ask();
  });
}

export default {
  key: 'speed',
  name: 'تحدّي الدقيقة',
  en: '60-second challenge',
  icon: 'fire',
  description: 'أكبر عدد من الإجابات الصحيحة في 60 ثانية.',
  can: (w) => !!w.arabic,
  /** Whole-round game: resolves with the points; record(w, ok) saves each answer. */
  round: async (stage, { words, pool, record, onProgress }) => ({ points: await round(stage, words, pool, record, onProgress) }),
};
