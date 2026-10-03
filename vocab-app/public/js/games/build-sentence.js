// Game: ركّب الجملة (Build the sentence)
import { speak } from '../audio.js';
import { esc, shuffle, highlight } from '../ui.js';
import { buildable } from './shared.js';

export default {
  key: 'build',
  name: 'ركّب الجملة',
  en: 'Build the sentence',
  icon: 'shuffle',
  description: 'رتّب كلمات الجملة بالترتيب الصحيح.',
  /** Can this word be asked in this format? */
  can: (w) => !!buildable(w),
  /** Ask one word; resolves true (correct) or false. */
  play: (stage, w) => new Promise((resolve) => {
    const sentence = buildable(w);
    const tokens = sentence.split(/\s+/);
    let pool = shuffle(tokens.map((t, k) => ({ t, k })));
    if (pool.every((p, k) => p.k === k) && pool.length > 2) pool = [...pool.slice(1), pool[0]];
    const placed = [];
    let checked = false;
    const draw = () => {
      stage.innerHTML = `
        <div class="card question"><div class="prompt">رتّب الكلمات لتكوين جملة فيها</div><div class="q-big" style="font-size:26px">${esc(w.term)}</div>${w.arabic ? `<div class="small muted">${esc(w.arabic)}</div>` : ''}</div>
        <div class="token-area" id="answer" style="margin-top:14px">${placed.map((p, k) => `<button class="token placed" data-from="a" data-k="${k}">${esc(p.t)}</button>`).join('') || '<span class="muted small" dir="rtl">اضغط الكلمات بالترتيب…</span>'}</div>
        <div class="token-area pool" style="margin-top:10px">${pool.map((p, k) => `<button class="token" data-from="p" data-k="${k}">${esc(p.t)}</button>`).join('')}</div>
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
        const ok = placed.map((p) => p.t).join(' ') === sentence;
        const fb = stage.querySelector('#fb');
        fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${ok ? 'الترتيب صحيح ✓' : 'الترتيب الصحيح:'}</b><div class="en" style="margin-top:4px">${highlight(sentence, w.term)}</div>`;
        speak(sentence, { rate: 0.9 }).catch(() => {});
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
