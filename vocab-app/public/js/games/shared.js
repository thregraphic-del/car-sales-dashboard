// Building blocks shared by the review games.
import { speak } from '../audio.js';
import { esc, shuffle, termRegex } from '../ui.js';

export const letters = (w) => w.term.replace(/\b(something|someone)\b/gi, '').replace(/\s+/g, ' ').trim();

export function sentencesFor(w) {
  const list = [];
  for (const k of ['easy', 'user', 'example']) {
    const e = w.examples?.find((x) => x.kind === k);
    if (e) list.push(e.sentence);
  }
  if (w.context_sentence) list.push(w.context_sentence);
  return [...new Set(list)];
}
export function blankable(w) {
  const re = termRegex(w.term);
  if (!re) return null;
  for (const s of sentencesFor(w)) {
    const m = s.match(re);
    if (m) return { sentence: s, match: m[0], index: m.index };
  }
  return null;
}
export const buildable = (w) => sentencesFor(w).find((x) => {
  const n = x.split(/\s+/).length;
  return n >= 4 && n <= 13;
}) || null;

/** Up to n other words whose key (meaning/term) differs from the target's. */
export function distractors(target, pool, n, key) {
  const seen = new Set([key(target)]);
  const out = [];
  const same = shuffle(pool.filter((w) => w.uv_id !== target.uv_id && w.level === target.level));
  const other = shuffle(pool.filter((w) => w.uv_id !== target.uv_id && w.level !== target.level));
  for (const w of [...same, ...other]) {
    if (out.length >= n) break;
    const k = key(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** A multiple-choice question; resolves true/false. */
export function choice(stage, w, { prompt, options, text, after = '' }) {
  return new Promise((resolve) => {
    const opts = shuffle([w, ...options]);
    stage.innerHTML = `<div class="card question">${prompt}</div>
      <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${text(o)}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div>
      <div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    let done = false;
    stage.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
      if (done) return;
      done = true;
      const ok = opts[Number(btn.dataset.k)].uv_id === w.uv_id;
      stage.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (opts[Number(b.dataset.k)].uv_id === w.uv_id) b.classList.add('correct');
      });
      if (!ok) btn.classList.add('wrong');
      reveal(stage, w, ok, after);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    }));
  });
}

export function reveal(stage, w, ok, extra = '') {
  const fb = stage.querySelector('#fb');
  fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
  fb.innerHTML = `<b>${ok ? 'صحيح ✓' : 'ليست صحيحة'}</b> — <span class="en-inline"><b>${esc(w.term)}</b></span>: ${esc(w.arabic || '')}${extra}`;
  if (ok) speak(w.term).catch(() => {});
}
