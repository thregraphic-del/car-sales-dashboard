// Game: لعبة الذاكرة (Memory) — flip two cards: an English word and its meaning.
import { speak } from '../audio.js';
import { esc, shuffle } from '../ui.js';

function memoryRound(stage, set) {
  return new Promise((resolve) => {
    const results = new Map();
    const cards = shuffle([...set.map((w) => ({ id: w.uv_id, t: w.term, en: 1 })), ...set.map((w) => ({ id: w.uv_id, t: w.arabic, en: 0 }))]);
    stage.innerHTML = `<div class="card question" style="padding:14px"><div class="prompt" style="margin:0">اقلب بطاقتين: الكلمة ومعناها</div></div>
      <div class="mem-grid">${cards.map((c, k) => `<button class="mem-card" data-k="${k}"><span class="${c.en ? 'en' : ''}">${esc(c.t)}</span></button>`).join('')}</div>`;
    let open = [];
    let busy = false;
    stage.querySelectorAll('.mem-card').forEach((el) => el.addEventListener('click', () => {
      if (busy || el.classList.contains('up') || el.classList.contains('done')) return;
      const c = cards[Number(el.dataset.k)];
      el.classList.add('up');
      if (c.en) speak(c.t).catch(() => {});
      open.push([el, c]);
      if (open.length < 2) return;
      const [[e1, c1], [e2, c2]] = open;
      open = [];
      if (c1.id === c2.id) {
        [e1, e2].forEach((e) => e.classList.add('done'));
        if (!results.has(c1.id)) results.set(c1.id, true);
        if (stage.querySelectorAll('.mem-card.done').length === cards.length) setTimeout(() => resolve(results), 500);
      } else {
        busy = true;
        // a miss counts only against a card already seen before
        for (const c of [c1, c2]) if (c._seen && !results.has(c.id)) results.set(c.id, false);
        c1._seen = c2._seen = true;
        setTimeout(() => { [e1, e2].forEach((e) => e.classList.remove('up')); busy = false; }, 800);
      }
    }));
  });
}

export default {
  key: 'memory',
  name: 'لعبة الذاكرة',
  en: 'Memory',
  icon: 'cards',
  description: 'اقلب البطاقات وطابق كل كلمة مع معناها.',
  can: (w) => !!w.arabic,
  round: async (stage, { words, record, onProgress, score }) => {
    const usable = words.filter((w) => w.arabic);
    for (let k = 0; k < usable.length; k += 6) {
      onProgress(k, usable.length, score);
      const set = usable.slice(k, k + 6);
      if (set.length < 2) break;
      const res = await memoryRound(stage, set);
      for (const w of set) await record(w, res.get(w.uv_id) !== false);
    }
    return {};
  },
};
