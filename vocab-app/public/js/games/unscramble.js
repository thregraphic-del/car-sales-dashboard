// Game: رتّب الحروف (Unscramble)
import { esc, shuffle } from '../ui.js';
import { letters, reveal } from './shared.js';

export default {
  key: 'scramble',
  name: 'رتّب الحروف',
  en: 'Unscramble',
  icon: 'shuffle',
  description: 'رتّب الحروف المبعثرة لتكوين الكلمة.',
  /** Can this word be asked in this format? */
  can: (w) => /^[a-z' -]{4,14}$/i.test(letters(w)),
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w) => new Promise((resolve) => {
    const target = letters(w);
    let pool = shuffle([...target.replace(/ /g, '')].map((c, k) => ({ c, k })));
    if (pool.map((p) => p.c).join('') === target.replace(/ /g, '')) pool = [...pool.slice(1), pool[0]];
    const placed = [];
    let checked = false;
    const draw = () => {
      stage.innerHTML = `<div class="card question"><div class="prompt">رتّب الحروف لتكوين الكلمة</div>
          <div class="q-ar">${esc(w.arabic || '')}</div>${w.simple_english ? `<div class="small muted en" style="text-align:center;margin-top:6px">${esc(w.simple_english)}</div>` : ''}</div>
        <div class="token-area letters" style="margin-top:14px">${placed.map((p, k) => `<button class="token placed" data-from="a" data-k="${k}">${esc(p.c)}</button>`).join('') || '<span class="muted small" dir="rtl">اضغط الحروف بالترتيب…</span>'}</div>
        <div class="token-area pool letters" style="margin-top:10px">${pool.map((p, k) => `<button class="token" data-from="p" data-k="${k}">${esc(p.c)}</button>`).join('')}</div>
        <div class="feedback" id="fb"></div>
        <div class="btn-row" style="justify-content:center;margin-top:14px"><button class="btn" id="clear">مسح</button><button class="btn primary" id="check" ${pool.length ? 'disabled' : ''}>تحقّق</button><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
      stage.querySelectorAll('.token').forEach((b) => b.addEventListener('click', () => {
        if (checked) return;
        const k = Number(b.dataset.k);
        if (b.dataset.from === 'p') placed.push(...pool.splice(k, 1));
        else pool.push(...placed.splice(k, 1));
        draw();
      }));
      stage.querySelector('#clear').addEventListener('click', () => {
        if (checked) return;
        pool.push(...placed.splice(0));
        draw();
      });
      stage.querySelector('#check').addEventListener('click', () => {
        checked = true;
        const ok = placed.map((p) => p.c).join('').toLowerCase() === target.replace(/ /g, '').toLowerCase();
        reveal(stage, w, ok);
        stage.querySelector('#check').classList.add('hidden');
        stage.querySelector('#clear').classList.add('hidden');
        const next = stage.querySelector('#nextBtn');
        next.classList.remove('hidden');
        next.addEventListener('click', () => resolve(ok));
      });
    };
    draw();
  }),
};
