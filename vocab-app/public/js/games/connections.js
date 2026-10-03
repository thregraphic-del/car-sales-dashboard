// Game: روابط الكلمات (Word connections) — match words with meanings, 6 at a time.
import { speak } from '../audio.js';
import { esc, shuffle } from '../ui.js';

/** Match-the-pairs round over a set of words; resolves with Map(uv_id → correct). */
function connectRound(stage, set) {
  return new Promise((resolve) => {
    const results = new Map();
    const left = shuffle(set);
    const right = shuffle(set);
    let selL = null;
    let selR = null;
    stage.innerHTML = `<div class="card question" style="padding:16px"><div class="prompt" style="margin:0">اضغط كلمة إنجليزية ثم معناها</div></div>
      <div class="match-cols" style="margin-top:14px">
        <div class="col">${left.map((w) => `<button class="match-item en" data-side="L" data-id="${w.uv_id}" style="text-align:center">${esc(w.term)}</button>`).join('')}</div>
        <div class="col">${right.map((w) => `<button class="match-item" data-side="R" data-id="${w.uv_id}">${esc(w.arabic)}</button>`).join('')}</div>
      </div>`;
    const check = () => {
      if (!selL || !selR) return;
      const a = Number(selL.dataset.id);
      const b = Number(selR.dataset.id);
      if (a === b) {
        [selL, selR].forEach((el) => el.classList.replace('sel', 'done'));
        if (!results.has(a)) results.set(a, true);
        speak(set.find((x) => x.uv_id === a).term).catch(() => {});
        if ([...stage.querySelectorAll('.match-item.done')].length === set.length * 2) setTimeout(() => resolve(results), 500);
      } else {
        [selL, selR].forEach((el) => {
          el.classList.add('wrong');
          setTimeout(() => el.classList.remove('wrong', 'sel'), 450);
        });
        if (!results.has(a)) results.set(a, false);
      }
      selL = null;
      selR = null;
    };
    stage.querySelectorAll('.match-item').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.side === 'L') {
        selL?.classList.remove('sel');
        selL = el;
      } else {
        selR?.classList.remove('sel');
        selR = el;
      }
      el.classList.add('sel');
      check();
    }));
  });
}

export default {
  key: 'connect',
  name: 'روابط الكلمات',
  en: 'Word connections',
  icon: 'puzzle',
  description: 'طابق كل كلمة مع معناها بأسرع وقت.',
  can: (w) => !!w.arabic,
  round: async (stage, { words, record, onProgress, score }) => {
    const usable = words.filter((w) => w.arabic);
    for (let k = 0; k < usable.length; k += 6) {
      onProgress(k, usable.length, score);
      const set = usable.slice(k, k + 6);
      if (set.length < 2) break;
      const res = await connectRound(stage, set);
      for (const w of set) await record(w, res.get(w.uv_id) !== false);
    }
    return {};
  },
};
